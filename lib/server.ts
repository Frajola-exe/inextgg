import { env } from "cloudflare:workers";
import { currentUser, isAdmin, AuthError } from "./auth";
import { paymentMismatch, cancellationMismatch, PaymentMismatchError, appmaxStatus, pixInstructions } from "./payment";
import { createAppmaxClient, appmaxReady } from "./appmax";
export function db() { if(!env.DB) throw new Error("Banco indisponível."); return env.DB; }
export async function identity(admin=false) {
 const user=await currentUser();
 if(!user) throw new Error("AUTH:Entre na sua conta para continuar.");
 if(admin && !isAdmin(user)) throw new Error("FORBIDDEN:Acesso administrativo não autorizado. Configure ADMIN_EMAILS na hospedagem.");
 return user;
}
export function sameOrigin(request:Request) { if(request.headers.get("origin") !== new URL(request.url).origin) throw new Error("FORBIDDEN:Origem inválida."); }
export function failure(e:unknown) { const msg=e instanceof Error ? e.message : "Erro inesperado"; return Response.json({error:msg.replace(/^(AUTH|FORBIDDEN):/,"")},{status:e instanceof AuthError?e.status:msg.startsWith("AUTH:")?401:msg.startsWith("FORBIDDEN:")?403:400,headers:{"Cache-Control":"private, no-store"}}); }
export async function config() {
 const row=await db().prepare("SELECT value FROM settings WHERE id='store'").first<{value:string}>();
 const settings=row ? JSON.parse(row.value) : {discord:"https://discord.gg/Fev2paUtsC",whatsapp:"",automatic:true};
 return {discord:settings.discord,whatsapp:settings.whatsapp,automatic:settings.automatic};
}
export function pixReady() {return appmaxReady(env);}
export function appmax(path:string,init:RequestInit={}) {return createAppmaxClient(env)(path,init);}
// A cancellation made in the Appmax dashboard may arrive without a webhook.
// Sweep reservations before reading stock, sharing a throttle across instances.
export async function reconcileInventory() {
 if(!pixReady()) return;
 const now=Date.now(),cutoff=now-30000;
 const claim=await db().prepare("INSERT INTO settings(id,value) VALUES('appmax_inventory_sync',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS BIGINT)<=?").bind(String(now),now-15000).run();
 if(!claim.meta.changes) return;
 const candidates=await db().prepare("SELECT o.* FROM orders o LEFT JOIN appmax_webhook_jobs j ON j.order_id=o.id WHERE o.payment_provider='appmax' AND o.payment_id IS NOT NULL AND (j.order_id IS NOT NULL OR (o.paid_at IS NULL AND o.delivered_at IS NULL AND EXISTS(SELECT 1 FROM keys k WHERE k.order_id=o.id))) AND (j.order_id IS NULL OR j.received_at<=?) ORDER BY COALESCE(j.received_at,0),o.created_at,o.id LIMIT 5").bind(cutoff).all<any>();
 if(!candidates.results.length) return;
 // Reuse the durable retry queue. Moving checked orders to the back makes
 // later reservations reachable even when the first batch remains pending.
 const claims=await db().batch(candidates.results.map(order=>db().prepare("INSERT INTO appmax_webhook_jobs(order_id,received_at) VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET received_at=excluded.received_at WHERE appmax_webhook_jobs.received_at<=?").bind(order.id,now,cutoff)));
 await Promise.all(candidates.results.map(async(order,index)=>{
  if(!claims[index].meta.changes) return;
  try {await reconcile(order);} catch {console.error("Appmax reconciliation pending",order.id);}
 }));
}
export async function fulfill(id:string, manual=false) {
 const c=await config();
 const o=await db().prepare("SELECT * FROM orders WHERE id=?").bind(id).first<any>();
 if(!o || o.status!=="approved" || o.delivered_at) return;
 const items=JSON.parse(o.items);
 if(!manual && (!c.automatic || items.some((i:any)=>!i.automatic))) return;
 const reserved=await db().prepare("SELECT COUNT(*) n FROM keys WHERE order_id=?").bind(id).first<any>();
 if(reserved.n!==items.reduce((s:number,i:any)=>s+i.quantity,0)) throw new Error("Estoque reservado inconsistente. Procure o atendimento.");
 await db().prepare("UPDATE orders SET delivered_at=? WHERE id=? AND status='approved' AND delivered_at IS NULL").bind(Date.now(),id).run();
}
export async function reconcile(order:any) {
 // Old checkout failures may still hold stock despite never creating a Pix.
 // Release only the recorded safe-to-retry state; unknown outcomes stay reserved.
 await db().prepare("UPDATE keys SET order_id=NULL WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_provider='appmax' AND payment_state='idle' AND paid_at IS NULL AND qr IS NULL AND status IN ('creating','pending'))").bind(order.id,order.id).run();
 if(!order.payment_id) return;
 if(order.payment_provider!=="appmax") throw new Error("Pedido anterior à integração Appmax. Consulte o atendimento para verificar este pagamento.");
 const payment=await appmax(`/v1/orders/${encodeURIComponent(order.payment_id)}`);
 const status=appmaxStatus(payment.order?.status);
 if(["cancelled","rejected"].includes(status)) {
  const mismatch=cancellationMismatch(order,payment);
  if(mismatch) throw new PaymentMismatchError(mismatch);
  const results=await db().batch([
   db().prepare("UPDATE orders SET status=?,payment_state='done',qr=NULL,qr_image=NULL,pix_expires_at=NULL WHERE id=? AND paid_at IS NULL AND delivered_at IS NULL").bind(status,order.id),
   db().prepare("UPDATE keys SET order_id=NULL WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND paid_at IS NULL AND delivered_at IS NULL AND status IN ('cancelled','rejected'))").bind(order.id,order.id)
  ]);
  if(!results[0].meta.changes) throw new PaymentMismatchError("cancelamento de pedido com pagamento ou entrega registrados");
  await db().prepare("DELETE FROM appmax_webhook_jobs WHERE order_id=?").bind(order.id).run();
  return;
 }
 const mismatch=paymentMismatch(order,payment);
 if(mismatch) throw new PaymentMismatchError(mismatch);
 const pix=pixInstructions(payment);
 if(pix) await db().prepare("UPDATE orders SET qr=?,qr_image=?,pix_expires_at=?,payment_state='done' WHERE id=?").bind(pix.qr,pix.image,pix.expiresAt,order.id).run();
 if(status==="approved") {
  await db().prepare("UPDATE orders SET status='approved',paid_at=COALESCE(paid_at,?) WHERE id=?").bind(Date.now(),order.id).run();
  await fulfill(order.id);
 } else if(["refunded","charged_back","review"].includes(status)) {
  await db().prepare("UPDATE orders SET status=? WHERE id=?").bind(status,order.id).run();
 }
 if(!["pending","review"].includes(status)) await db().prepare("DELETE FROM appmax_webhook_jobs WHERE order_id=?").bind(order.id).run();
}

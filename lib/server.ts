import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { paymentMatches, appmaxStatus, pixInstructions } from "./payment";
import { createAppmaxClient, appmaxReady } from "./appmax";
export function db() { if(!env.DB) throw new Error("Banco indisponível."); return env.DB; }
export async function identity(admin=false) {
 const user=await getChatGPTUser();
 if(!user) throw new Error("AUTH:Entre na sua conta para continuar.");
 const allowed=(env.ADMIN_EMAILS || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(admin && !allowed.includes(user.email.toLowerCase())) throw new Error("FORBIDDEN:Acesso administrativo não autorizado. Configure ADMIN_EMAILS na hospedagem.");
 return user;
}
export function sameOrigin(request:Request) { if(request.headers.get("origin") !== new URL(request.url).origin) throw new Error("FORBIDDEN:Origem inválida."); }
export function failure(e:unknown) { const msg=e instanceof Error ? e.message : "Erro inesperado"; return Response.json({error:msg.replace(/^(AUTH|FORBIDDEN):/,"")},{status:msg.startsWith("AUTH:")?401:msg.startsWith("FORBIDDEN:")?403:400}); }
export async function config() {
 const row=await db().prepare("SELECT value FROM settings WHERE id='store'").first<{value:string}>();
 return row ? JSON.parse(row.value) : {discord:"https://discord.gg/Fev2paUtsC",whatsapp:"",installer:"",automatic:true};
}
export function pixReady() {return appmaxReady(env);}
export function appmax(path:string,init:RequestInit={}) {return createAppmaxClient(env)(path,init);}
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
 if(!order.payment_id) return;
 if(order.payment_provider!=="appmax") throw new Error("Pedido anterior à integração Appmax. Consulte o atendimento para verificar este pagamento.");
 const payment=await appmax(`/v1/orders/${encodeURIComponent(order.payment_id)}`);
 if(!paymentMatches(order,payment)) throw new Error("Dados do pagamento não correspondem ao pedido.");
 const status=appmaxStatus(payment.order.status);
 const pix=pixInstructions(payment);
 if(pix) await db().prepare("UPDATE orders SET qr=?,qr_image=?,pix_expires_at=?,payment_state='done' WHERE id=?").bind(pix.qr,pix.image,pix.expiresAt,order.id).run();
 if(status==="approved") {
  await db().prepare("UPDATE orders SET status='approved',paid_at=COALESCE(paid_at,?) WHERE id=?").bind(Date.now(),order.id).run();
  await fulfill(order.id);
 } else if(["cancelled","rejected"].includes(status)) {
  await db().batch([db().prepare("UPDATE orders SET status=? WHERE id=? AND paid_at IS NULL").bind(status,order.id),db().prepare("UPDATE keys SET order_id=NULL WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND paid_at IS NULL AND status IN ('cancelled','rejected'))").bind(order.id,order.id)]);
 } else if(["refunded","charged_back","review"].includes(status)) {
  await db().prepare("UPDATE orders SET status=? WHERE id=?").bind(status,order.id).run();
 }
 if(!["pending","review"].includes(status)) await db().prepare("DELETE FROM appmax_webhook_jobs WHERE order_id=?").bind(order.id).run();
}

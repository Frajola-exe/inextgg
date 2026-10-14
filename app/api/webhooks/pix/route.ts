import { waitUntil } from "cloudflare:workers";
import { db, reconcile, pixReady } from "../../../../lib/server";
import { webhookOrderId } from "../../../../lib/payment";
export async function POST(request:Request) {
 if(!pixReady()) return new Response("Unavailable",{status:503});
 try {
  if(!request.headers.get("content-type")?.includes("application/json")) return new Response("Invalid content type",{status:415});
  const raw=await request.text();if(raw.length>65536)return new Response("Payload too large",{status:413});
  const id=webhookOrderId(JSON.parse(raw));if(!id)return new Response("OK");
  const order=await db().prepare("SELECT * FROM orders WHERE payment_id=? AND payment_provider='appmax'").bind(id).first<any>();
  if(order) {
   // Unsigned notifications only trigger an authenticated API query. Persist before acknowledging.
   await db().prepare("INSERT INTO appmax_webhook_jobs(order_id,received_at) VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET received_at=excluded.received_at").bind(order.id,Date.now()).run();
   waitUntil(reconcile(order).catch(()=>{console.error("Appmax reconciliation pending",order.id);}));
  }
  return new Response("OK");
 }catch{return new Response("Retry",{status:503});}
}

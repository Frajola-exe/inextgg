import { db, identity, failure, appmax, pixReady, reconcile, sameOrigin, config } from "../../../lib/server";
import { AppmaxError } from "../../../lib/appmax";
import { pixInstructions } from "../../../lib/payment";
import { checkoutSchema } from "../../../lib/checkout";
import { reservationStatements } from "../../../lib/inventory";
export async function GET(request:Request) {
 try {
  const user=await identity(), id=new URL(request.url).searchParams.get("id");
  if(!id) {const orders=await db().prepare("SELECT id,items,total,status,created_at,delivered_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.userId).all(); return Response.json(orders.results);}
  let o=await db().prepare("SELECT * FROM orders WHERE id=? AND user_id=?").bind(id,user.userId).first<any>();
  if(!o) return Response.json({error:"Pedido não encontrado."},{status:404});
  if(o.payment_id && o.payment_provider==="appmax") {await reconcile(o); o=await db().prepare("SELECT * FROM orders WHERE id=?").bind(id).first<any>();}
  const keys=o.status==="approved" && o.delivered_at ? (await db().prepare("SELECT k.code,p.name FROM keys k JOIN products p ON p.id=k.product_id WHERE k.order_id=?").bind(id).all()).results : [];
  return Response.json({...o,keys,settings:await config()});
 }catch(e){return failure(e);}
}
export async function POST(request:Request) {
 try {
  sameOrigin(request); const user=await identity();
  if(!pixReady()) throw new Error("Pix Appmax ainda não configurado. Nenhuma cobrança foi realizada.");
  const body=checkoutSchema.parse(await request.json());
  if(new Set(body.items.map(i=>i.id)).size!==body.items.length) throw new Error("Produtos duplicados.");
  const requestKey=`${user.userId}:${body.requestKey}`;
  let order=await db().prepare("SELECT * FROM orders WHERE request_key=?").bind(requestKey).first<any>();
  if(!order) {
   const products=await Promise.all(body.items.map(i=>db().prepare("SELECT * FROM products WHERE id=? AND active=1 AND deleted=0").bind(i.id).first<any>()));
   if(products.some(p=>!p)) throw new Error("Produto indisponível.");
   const items=products.map((p,i)=>({id:p.id,name:p.name,price:p.price,quantity:body.items[i].quantity,automatic:p.automatic}));
   const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0),id=crypto.randomUUID();
   try {await db().batch(reservationStatements({id,userId:user.userId,email:user.email,requestKey,createdAt:Date.now(),items}).map(s=>db().prepare(s.sql).bind(...s.values)));}
   catch(error) {if(!await db().prepare("SELECT id FROM orders WHERE request_key=?").bind(requestKey).first()) throw error;}
   order=await db().prepare("SELECT * FROM orders WHERE request_key=?").bind(requestKey).first<any>();
   if(!order) throw new Error("Estoque insuficiente. Atualize o catálogo e tente novamente.");
  }
  if(order.payment_provider!=="appmax") throw new Error("Este pedido é anterior à integração Appmax. Procure o atendimento.");
  if(order.payment_id) {await reconcile(order);order=await db().prepare("SELECT * FROM orders WHERE id=?").bind(order.id).first<any>();}
  if(order.qr || order.paid_at || ["cancelled","rejected","refunded","charged_back"].includes(order.status)) return Response.json({id:order.id});
  if(order.payment_state!=="idle") return Response.json({id:order.id});
  const claim=await db().prepare("UPDATE orders SET payment_state='processing' WHERE id=? AND payment_state='idle'").bind(order.id).run();
  if(!claim.meta.changes) return Response.json({id:order.id});
  let stage="customer";
  try {
   if(!order.appmax_customer_id) {
    const customer=await appmax("/v1/customers",{method:"POST",body:JSON.stringify({first_name:body.buyer.firstName,last_name:body.buyer.lastName,email:order.email,phone:body.buyer.phone,document_number:body.buyer.document,ip:body.buyer.ip})});
    if(!customer.customer?.id) throw new Error("A Appmax não retornou o cliente.");
    order.appmax_customer_id=String(customer.customer.id);
    await db().prepare("UPDATE orders SET appmax_customer_id=? WHERE id=?").bind(order.appmax_customer_id,order.id).run();
   }
   if(!order.payment_id) {
    stage="order";
    const remote=await appmax("/v1/orders",{method:"POST",body:JSON.stringify({customer_id:Number(order.appmax_customer_id),products_value:order.total,shipping_value:0,discount_value:0,products:JSON.parse(order.items).map((i:any)=>({sku:i.id,name:i.name,quantity:i.quantity,unit_value:i.price,type:"digital"}))})});
    if(!remote.order?.id) throw new Error("A Appmax não retornou o pedido.");
    order.payment_id=String(remote.order.id);
    await db().prepare("UPDATE orders SET payment_id=? WHERE id=?").bind(order.payment_id,order.id).run();
   }
   stage="pix";
   const payment=await appmax("/v1/payments/pix",{method:"POST",body:JSON.stringify({order_id:Number(order.payment_id),payment_data:{pix:{document_number:body.buyer.document}}})});
   const pix=pixInstructions(payment);
   if(!pix) throw new Error("A Appmax não retornou as instruções Pix completas. Consulte o pedido antes de tentar novamente.");
   await db().prepare("UPDATE orders SET status=CASE WHEN status='creating' THEN 'pending' ELSE status END,payment_state='done',qr=?,qr_image=?,pix_expires_at=? WHERE id=?").bind(pix.qr,pix.image,pix.expiresAt,order.id).run();
  }catch(error) {
   const safe=stage==="customer" || (error instanceof AppmaxError && error.definite);
   await db().prepare("UPDATE orders SET payment_state=? WHERE id=? AND payment_state='processing'").bind(safe?"idle":"unknown",order.id).run();
   if(safe) throw error;
   return Response.json({id:order.id});
  }
  return Response.json({id:order.id});
 }catch(e){return failure(e);}
}

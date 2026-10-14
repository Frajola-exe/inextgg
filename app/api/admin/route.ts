import { db, identity, failure, sameOrigin, config, reconcile, fulfill, pixReady } from "../../../lib/server";
import { z } from "zod";
import { samples } from "../../../lib/catalog";
const image=z.union([z.literal(""),z.string().url().refine(v=>v.startsWith("https://"))]);
const product=z.object({id:z.string().optional(),name:z.string().min(2).max(120),category:z.enum(["Steam","PlayStation","Xbox","Outros"]),description:z.string().max(3000),image,price:z.number().int().min(1).max(10000000),old_price:z.number().int().min(0),active:z.number().int().min(0).max(1),automatic:z.number().int().min(0).max(1)});
export async function GET() {
 try {
  const user=await identity(true);
  if(pixReady()) {
   const jobs=await db().prepare("SELECT o.* FROM appmax_webhook_jobs j JOIN orders o ON o.id=j.order_id ORDER BY j.received_at LIMIT 5").all<any>();
   waitUntil(Promise.allSettled(jobs.results.map(order=>reconcile(order))));
  }
  const products=await db().prepare("SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id=p.id AND k.order_id IS NULL) stock FROM products p WHERE deleted=0").all();
  const orders=await db().prepare("SELECT id,email,items,total,status,created_at,paid_at,delivered_at FROM orders ORDER BY created_at DESC LIMIT 5000").all();
  return Response.json({products:products.results,orders:orders.results,settings:await config(),email:user.email,pixReady:pixReady()});
 }catch(e){return failure(e);}
}
export async function POST(request:Request) {
 try {
  sameOrigin(request); await identity(true); const body:any=await request.json();
  if(body.action==="product") {
   const p=product.parse(body.product),id=p.id || crypto.randomUUID();
   await db().prepare("INSERT INTO products(id,name,category,description,image,price,old_price,active,automatic) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,image=excluded.image,price=excluded.price,old_price=excluded.old_price,active=excluded.active,automatic=excluded.automatic").bind(id,p.name,p.category,p.description,p.image,p.price,p.old_price,p.active,p.automatic).run();
  } else if(body.action==="delete") {
   await db().prepare("UPDATE products SET deleted=1,active=0 WHERE id=?").bind(z.string().parse(body.id)).run();
  } else if(body.action==="keys") {
   const id=z.string().parse(body.id),codes=z.array(z.string().min(3).max(300)).min(1).max(200).parse(body.codes);
   const exists=await db().prepare("SELECT id FROM products WHERE id=? AND deleted=0").bind(id).first();
   if(!exists) throw new Error("Produto não encontrado.");
   if(new Set(codes).size!==codes.length) throw new Error("A lista contém keys duplicadas.");
   await db().batch(codes.map(code=>db().prepare("INSERT INTO keys(id,product_id,code) VALUES(?,?,?)").bind(crypto.randomUUID(),id,code)));
  } else if(body.action==="settings") {
   const value=z.object({discord:z.string().url().refine(v=>v.startsWith("https://discord.gg/")||v.startsWith("https://discord.com/invite/")),whatsapp:z.union([z.literal(""),z.string().regex(/^\d{10,15}$/)]),installer:image,automatic:z.boolean()}).parse(body.settings);
   await db().prepare("INSERT INTO settings(id,value) VALUES('store',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(JSON.stringify(value)).run();
  } else if(body.action==="seed") {
   const existing=await db().prepare("SELECT COUNT(*) c FROM products WHERE deleted=0").first<any>();
   if(existing.c) throw new Error("O catálogo já possui produtos.");
   await db().batch(samples.map(p=>db().prepare("INSERT INTO products(id,name,category,description,image,price,old_price,active,automatic) VALUES(?,?,?,?,?,?,?,0,1)").bind(crypto.randomUUID(),p.name,p.category,p.description,p.image,p.price,p.old_price)));
  } else if(body.action==="deliver" || body.action==="reconcile") {
   const order=await db().prepare("SELECT * FROM orders WHERE id=?").bind(z.string().parse(body.id)).first<any>();
   if(!order) throw new Error("Pedido não encontrado.");
   await reconcile(order); if(body.action==="deliver") await fulfill(order.id,true);
  } else throw new Error("Ação desconhecida.");
  return Response.json({ok:true});
 }catch(e){return failure(e);}
}
import { waitUntil } from "cloudflare:workers";

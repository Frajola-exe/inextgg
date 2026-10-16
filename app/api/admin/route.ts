import { db, identity, failure, sameOrigin, config, reconcile, reconcileInventory, fulfill, pixReady } from "../../../lib/server";
import { z } from "zod";
const image=z.union([z.literal(""),z.string().url().refine(v=>v.startsWith("https://"))]);
const product=z.object({id:z.string().optional(),name:z.string().min(2).max(120),product_type:z.enum(["key","service","bot"]).default("key"),price_mode:z.enum(["fixed","negotiable"]).default("fixed"),category:z.enum(["Steam","PlayStation","Xbox","Outros"]),description:z.string().max(3000),image,price:z.number().int().min(0).max(10000000),old_price:z.number().int().min(0),active:z.number().int().min(0).max(1),automatic:z.number().int().min(0).max(1)}).superRefine((p,ctx)=>{
 if(p.product_type!=="key" && p.category!=="Outros") ctx.addIssue({code:"custom",message:"Serviços digitais e bots Discord pertencem à categoria Outros.",path:["category"]});
 if(p.product_type==="key" && p.price_mode!=="fixed") ctx.addIssue({code:"custom",message:"Keys precisam de preço fixo.",path:["price_mode"]});
 if(p.price_mode==="fixed" && p.price<1) ctx.addIssue({code:"custom",message:"Informe um preço fixo válido.",path:["price"]});
 if(p.price_mode==="negotiable" && (p.price!==0 || p.old_price!==0)) ctx.addIssue({code:"custom",message:"Preço negociável não pode ter valor definido.",path:["price"]});
});
export async function GET() {
 try {
  const user=await identity(true);
  await reconcileInventory();
  const products=await db().prepare("SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id=p.id AND k.order_id IS NULL) stock, (SELECT COUNT(*) FROM keys k JOIN orders o ON o.id=k.order_id WHERE k.product_id=p.id AND o.delivered_at IS NULL) reserved FROM products p WHERE deleted=0").all();
  const orders=await db().prepare("SELECT id,email,items,total,status,created_at,paid_at,delivered_at FROM orders ORDER BY created_at DESC LIMIT 5000").all();
  return Response.json({products:products.results,orders:orders.results,settings:await config(),email:user.email,provider:user.userId.startsWith("supabase:")?"supabase":"sites",pixReady:pixReady()},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return failure(e);}
}
export async function POST(request:Request) {
 try {
  sameOrigin(request); await identity(true); const body:any=await request.json();
  if(body.action==="product") {
   const p=product.parse(body.product),id=p.id || crypto.randomUUID();
   if(p.id && p.product_type!=="key") {
    const inventory=await db().prepare("SELECT COUNT(*) n FROM keys WHERE product_id=?").bind(p.id).first<{n:number}>();
    if(inventory?.n) throw new Error("Remova as keys existentes antes de alterar o tipo do produto.");
   }
   await db().prepare("INSERT INTO products(id,name,category,description,image,price,old_price,active,automatic,product_type,price_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,image=excluded.image,price=excluded.price,old_price=excluded.old_price,active=excluded.active,automatic=excluded.automatic,product_type=excluded.product_type,price_mode=excluded.price_mode").bind(id,p.name,p.category,p.description,p.image,p.price,p.old_price,p.active,p.product_type==="key"?p.automatic:0,p.product_type,p.price_mode).run();
  } else if(body.action==="delete") {
   await db().prepare("UPDATE products SET deleted=1,active=0 WHERE id=?").bind(z.string().parse(body.id)).run();
  } else if(body.action==="keys") {
   const id=z.string().parse(body.id),codes=z.array(z.string().min(3).max(300)).min(1).max(200).parse(body.codes);
   const exists=await db().prepare("SELECT id FROM products WHERE id=? AND deleted=0 AND product_type='key'").bind(id).first();
   if(!exists) throw new Error("Produto não encontrado.");
   if(new Set(codes).size!==codes.length) throw new Error("A lista contém keys duplicadas.");
   await db().batch(codes.map(code=>db().prepare("INSERT INTO keys(id,product_id,code) VALUES(?,?,?)").bind(crypto.randomUUID(),id,code)));
  } else if(body.action==="settings") {
   const value=z.object({discord:z.string().url().refine(v=>v.startsWith("https://discord.gg/")||v.startsWith("https://discord.com/invite/")),whatsapp:z.union([z.literal(""),z.string().regex(/^\d{10,15}$/)]),automatic:z.boolean()}).parse(body.settings);
   await db().prepare("INSERT INTO settings(id,value) VALUES('store',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(JSON.stringify(value)).run();
  } else if(body.action==="deliver" || body.action==="reconcile") {
   const order=await db().prepare("SELECT * FROM orders WHERE id=?").bind(z.string().parse(body.id)).first<any>();
   if(!order) throw new Error("Pedido não encontrado.");
   await reconcile(order); if(body.action==="deliver") await fulfill(order.id,true);
  } else throw new Error("Ação desconhecida.");
  return Response.json({ok:true});
 }catch(e){return failure(e);}
}
import { waitUntil } from "cloudflare:workers";

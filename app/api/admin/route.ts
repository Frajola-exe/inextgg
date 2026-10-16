import { db, identity, failure, sameOrigin, config, reconcile, reconcileInventory, fulfill, pixReady } from "../../../lib/server";
import { z } from "zod";
const image=z.union([z.literal(""),z.string().url().refine(v=>v.startsWith("https://"))]);
const variant=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(1).max(80),price:z.number().int().min(1).max(10000000),quantity:z.number().int().min(1).max(100000)});
const product=z.object({id:z.string().optional(),name:z.string().min(2).max(120),product_type:z.enum(["key","service","bot"]).default("key"),price_mode:z.enum(["fixed","negotiable"]).default("fixed"),category:z.enum(["Steam","PlayStation","Xbox","Outros"]),description:z.string().max(3000),image,price:z.number().int().min(0).max(10000000),old_price:z.number().int().min(0),active:z.number().int().min(0).max(1),automatic:z.number().int().min(0).max(1),variants:z.array(variant).max(30).default([])}).superRefine((p,ctx)=>{
 if(p.product_type!=="key" && p.category!=="Outros") ctx.addIssue({code:"custom",message:"Serviços digitais e bots Discord pertencem à categoria Outros.",path:["category"]});
 if(p.product_type==="key" && p.price_mode!=="fixed") ctx.addIssue({code:"custom",message:"Keys precisam de preço fixo.",path:["price_mode"]});
 if(p.price_mode==="fixed" && p.price<1 && !p.variants.length) ctx.addIssue({code:"custom",message:"Informe um preço fixo válido.",path:["price"]});
 if(p.price_mode==="negotiable" && (p.price!==0 || p.old_price!==0)) ctx.addIssue({code:"custom",message:"Preço negociável não pode ter valor definido.",path:["price"]});
 if(p.product_type!=="key" && p.variants.length) ctx.addIssue({code:"custom",message:"Versões só podem ser criadas para keys de jogos.",path:["variants"]});
 if(new Set(p.variants.map(v=>v.name.toLocaleLowerCase("pt-BR"))).size!==p.variants.length) ctx.addIssue({code:"custom",message:"Nomes de versões devem ser únicos.",path:["variants"]});
 if(new Set(p.variants.map(v=>v.id).filter(Boolean)).size!==p.variants.filter(v=>v.id).length) ctx.addIssue({code:"custom",message:"Versões duplicadas.",path:["variants"]});
});
export async function GET() {
 try {
  const user=await identity(true);
  await reconcileInventory();
  const products=await db().prepare("SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id=p.id AND k.order_id IS NULL) stock, (SELECT COUNT(*) FROM keys k JOIN orders o ON o.id=k.order_id WHERE k.product_id=p.id AND o.delivered_at IS NULL) reserved FROM products p WHERE deleted=0").all();
  const variants=await db().prepare("SELECT v.*, (SELECT COUNT(*) FROM keys k WHERE k.variant_id=v.id AND k.order_id IS NULL) stock, (SELECT COUNT(*) FROM keys k WHERE k.variant_id=v.id) imported FROM product_variants v WHERE active=1 ORDER BY name").all();
  const orders=await db().prepare("SELECT id,email,items,total,status,created_at,paid_at,delivered_at FROM orders ORDER BY created_at DESC LIMIT 5000").all();
  return Response.json({products:products.results.map((p:any)=>({...p,variants:variants.results.filter((v:any)=>v.product_id===p.id)})),orders:orders.results,settings:await config(),email:user.email,provider:user.userId.startsWith("supabase:")?"supabase":"sites",pixReady:pixReady()},{headers:{"Cache-Control":"private, no-store"}});
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
   const existing=p.id?(await db().prepare("SELECT id,quantity FROM product_variants WHERE product_id=? AND active=1").bind(id).all()).results as {id:string;quantity:number}[]:[];
   const submitted=new Set(p.variants.map(v=>v.id).filter(Boolean));
   if(p.variants.some(v=>v.id && !existing.some(e=>e.id===v.id))) throw new Error("Versão inválida para este produto.");
   const removed=existing.filter(v=>!submitted.has(v.id));
   for(const v of removed) if((await db().prepare("SELECT COUNT(*) n FROM keys WHERE variant_id=?").bind(v.id).first<{n:number}>())?.n) throw new Error("Não é possível remover uma versão com keys. Edite a versão existente.");
   for(const v of p.variants) if(v.id && (await db().prepare("SELECT COUNT(*) n FROM keys WHERE variant_id=?").bind(v.id).first<{n:number}>())!.n>v.quantity) throw new Error("A quantidade não pode ser menor que as keys já importadas.");
   const legacy=p.variants.length?(await db().prepare("SELECT COUNT(*) n FROM keys WHERE product_id=? AND variant_id IS NULL AND (order_id IS NULL OR EXISTS (SELECT 1 FROM orders o WHERE o.id=keys.order_id AND o.delivered_at IS NULL))").bind(id).first<{n:number}>())?.n||0:0;
   const firstImported=p.variants[0]?.id?(await db().prepare("SELECT COUNT(*) n FROM keys WHERE variant_id=?").bind(p.variants[0].id).first<{n:number}>())?.n||0:0;
   if(legacy && legacy+firstImported>p.variants[0].quantity) throw new Error("A primeira versão precisa comportar as keys disponíveis deste produto.");
   const firstVariantId=p.variants[0]?.id||crypto.randomUUID();
   await db().batch([
    db().prepare("INSERT INTO products(id,name,category,description,image,price,old_price,active,automatic,product_type,price_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,image=excluded.image,price=excluded.price,old_price=excluded.old_price,active=excluded.active,automatic=excluded.automatic,product_type=excluded.product_type,price_mode=excluded.price_mode").bind(id,p.name,p.category,p.description,p.image,p.variants.length?Math.min(...p.variants.map(v=>v.price)):p.price,p.variants.length?0:p.old_price,p.active,p.product_type==="key"?p.automatic:0,p.product_type,p.price_mode),
    ...removed.map(v=>db().prepare("UPDATE product_variants SET active=0 WHERE id=?").bind(v.id)),
    ...p.variants.map((v,index)=>db().prepare("INSERT INTO product_variants(id,product_id,name,price,quantity) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price,quantity=excluded.quantity").bind(index===0?firstVariantId:v.id||crypto.randomUUID(),id,v.name,v.price,v.quantity)),
    ...(legacy?[db().prepare("UPDATE keys SET variant_id=? WHERE product_id=? AND variant_id IS NULL AND (order_id IS NULL OR EXISTS (SELECT 1 FROM orders o WHERE o.id=keys.order_id AND o.delivered_at IS NULL))").bind(firstVariantId,id)]:[])
   ]);
  } else if(body.action==="delete") {
   await db().prepare("UPDATE products SET deleted=1,active=0 WHERE id=?").bind(z.string().parse(body.id)).run();
  } else if(body.action==="keys") {
   const id=z.string().parse(body.id),codes=z.array(z.string().min(3).max(300)).min(1).max(200).parse(body.codes),variantId=body.variantId?z.string().uuid().parse(body.variantId):null;
   const exists=await db().prepare("SELECT id FROM products WHERE id=? AND deleted=0 AND product_type='key'").bind(id).first();
   if(!exists) throw new Error("Produto não encontrado.");
   if(new Set(codes).size!==codes.length) throw new Error("A lista contém keys duplicadas.");
   const variants=(await db().prepare("SELECT id FROM product_variants WHERE product_id=? AND active=1").bind(id).all()).results;
   if(variants.length && !variantId || !variants.length && variantId) throw new Error("Selecione uma versão para importar keys.");
   if(variantId) {
    const v=await db().prepare("SELECT quantity FROM product_variants WHERE id=? AND product_id=? AND active=1").bind(variantId,id).first<{quantity:number}>();
    if(!v) throw new Error("Versão não encontrada.");
    const count=await db().prepare("SELECT COUNT(*) n FROM keys WHERE variant_id=?").bind(variantId).first<{n:number}>();
    if((count?.n||0)+codes.length>v.quantity) throw new Error("Quantidade de keys excede o limite da versão.");
   }
   await db().batch(codes.map(code=>db().prepare("INSERT INTO keys(id,product_id,code,variant_id) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,code,variantId)));
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

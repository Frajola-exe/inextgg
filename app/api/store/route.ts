import { db, config, failure, pixReady, reconcileInventory } from "../../../lib/server";
import { env } from "cloudflare:workers";
import { currentUser, isAdmin } from "../../../lib/auth";
export async function GET() {
 try {
  await reconcileInventory();
  const result=await db().prepare("SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id=p.id AND k.order_id IS NULL) stock FROM products p WHERE deleted=0 AND active=1").all();
  const variants=await db().prepare("SELECT v.*, (SELECT COUNT(*) FROM keys k WHERE k.variant_id=v.id AND k.order_id IS NULL) stock FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 AND p.active=1 AND p.deleted=0 ORDER BY v.name").all();
  const user=await currentUser();
  return Response.json({products:result.results.map((p:any)=>({...p,variants:variants.results.filter((v:any)=>v.product_id===p.id)})),settings:await config(),pixReady:pixReady(),appmax:{environment:env.APPMAX_ENVIRONMENT,externalId:env.APPMAX_EXTERNAL_ID},user:user?{email:user.email,name:user.displayName,isAdmin:isAdmin(user),provider:user.userId.startsWith("supabase:")?"supabase":"sites"}:null},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return failure(e);}
}

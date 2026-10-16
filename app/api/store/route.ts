import { db, config, failure, pixReady, reconcileInventory } from "../../../lib/server";
import { env } from "cloudflare:workers";
import { currentUser, isAdmin } from "../../../lib/auth";
export async function GET() {
 try {
  await reconcileInventory();
  const result=await db().prepare("SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id=p.id AND k.order_id IS NULL) stock FROM products p WHERE deleted=0 AND active=1").all();
  const user=await currentUser();
  return Response.json({products:result.results,settings:await config(),pixReady:pixReady(),appmax:{environment:env.APPMAX_ENVIRONMENT,externalId:env.APPMAX_EXTERNAL_ID},user:user?{email:user.email,name:user.displayName,isAdmin:isAdmin(user),provider:user.userId.startsWith("supabase:")?"supabase":"sites"}:null},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return failure(e);}
}

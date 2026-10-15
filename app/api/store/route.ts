import { identity, db, config, failure, pixReady } from "../../../lib/server";
import { env } from "cloudflare:workers";
export async function GET() {
 try {
  const result=await db().prepare("SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id=p.id AND k.order_id IS NULL) stock FROM products p WHERE deleted=0 AND active=1").all();
  let user=null; try {user=await identity();}catch{}
  return Response.json({products:result.results,settings:await config(),pixReady:pixReady(),appmax:{environment:env.APPMAX_ENVIRONMENT,externalId:env.APPMAX_EXTERNAL_ID},user:user?{email:user.email,name:user.displayName}:null});
 }catch(e){return failure(e);}
}

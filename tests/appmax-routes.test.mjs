import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
globalThis.__appmaxTestEnv={APPMAX_CLIENT_ID:'merchant',APPMAX_CLIENT_SECRET:'secret',APPMAX_ENVIRONMENT:'sandbox',APPMAX_EXTERNAL_ID:'installation'};
globalThis.__appmaxTestUser={userId:'buyer',email:'buyer@example.com',displayName:'Ana Silva'};
globalThis.__appmaxTestTasks=[];
const routes=await import('../app/api/orders/route.ts');
const webhook=await import('../app/api/webhooks/pix/route.ts');
const originalFetch=globalThis.fetch;
after(()=>{globalThis.fetch=originalFetch;});
function setup({status='pendente',pixFailure=0,paidTotal=1000,method='pix'}={}){
 const db=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`drizzle/${file}`,'utf8'));
 db.exec("INSERT INTO products(id,name,category,description,image,price) VALUES('p','Game','Steam','','',1000); INSERT INTO keys(id,product_id,code) VALUES('k','p','REAL-KEY')");
 function prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){const result=db.prepare(sql).run(...values);return {meta:{changes:result.changes}};}};}
 globalThis.__appmaxTestEnv.DB={prepare,async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const calls=[];
 const state={status,paidTotal,method,pixFailure};
 globalThis.fetch=async(url,init)=>{
  calls.push({url,body:init?.body});
  if(url.includes('/oauth2/token'))return Response.json({access_token:'test-token',expires_in:3600});
  if(url.endsWith('/v1/customers'))return Response.json({data:{customer:{id:10}}});
  if(url.endsWith('/v1/orders'))return Response.json({data:{order:{id:42,status:'pendente'}}});
  if(url.endsWith('/v1/payments/pix'))return state.pixFailure?Response.json({}, {status:state.pixFailure}):Response.json({data:{payment:{pix_emv:'000201',pix_qrcode:'YWJj',pix_expiration_date:'2026-10-13 15:30:00'}}});
  if(url.endsWith('/v1/orders/42'))return Response.json({data:{order:{id:42,status:state.status,total_paid:state.paidTotal,amounts:{sub_total:1000,shipping_value:0,discount:0,installment_fee:0}},customer:{id:10,email:'buyer@example.com'},payment:{method:state.method}}});
  throw new Error(`Unexpected endpoint: ${url}`);
 };
 const body={requestKey:crypto.randomUUID(),buyer:{firstName:'Ana',lastName:'Silva',phone:'71999999999',document:'52998224725',ip:'2001:db8::1'},items:[{id:'p',quantity:1}]};
 function post(){return routes.POST(new Request('https://store.test/api/orders',{method:'POST',headers:{origin:'https://store.test','content-type':'application/json'},body:JSON.stringify(body)}));}
 return {db,body,post,state,calls};
}
test('real checkout creates customer, digital order and Pix once; approved query delivers reserved key',async()=>{
 const s=setup();const response=await s.post();assert.equal(response.status,200);const {id}=await response.json();
 const order=s.db.prepare('SELECT * FROM orders').get();assert.equal(order.payment_provider,'appmax');assert.equal(order.payment_id,'42');assert.equal(order.qr,'000201');assert.equal(order.qr_image,'data:image/png;base64,YWJj');
 await s.post();assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/payments/pix')).length,1);
 const outgoing=JSON.parse(s.calls.find(c=>c.url.endsWith('/v1/orders')).body);assert.equal(outgoing.products_value,1000);assert.equal(outgoing.products[0].type,'digital');
 s.state.status='aprovado';const result=await routes.GET(new Request(`https://store.test/api/orders?id=${id}`));const paid=await result.json();assert.equal(paid.status,'approved');assert.equal(paid.keys[0].code,'REAL-KEY');
 s.state.status='estornado';const refunded=await routes.GET(new Request(`https://store.test/api/orders?id=${id}`));assert.deepEqual((await refunded.json()).keys,[]);
 s.db.close();
});
test('uncertain Pix outcome preserves reservation and repeated checkout never charges again',async()=>{const s=setup({pixFailure:503});const first=await s.post();assert.equal(first.status,200);const id=(await first.json()).id;assert.equal(s.db.prepare('SELECT payment_state FROM orders').get().payment_state,'unknown');await s.post();assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/payments/pix')).length,1);assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,id);s.state.status='cancelado';await routes.GET(new Request(`https://store.test/api/orders?id=${id}`));assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,null);s.db.close();});
test('definite validation rejection can retry on the same remote order',async()=>{const s=setup({pixFailure:422});assert.equal((await s.post()).status,400);assert.equal(s.db.prepare('SELECT payment_state FROM orders').get().payment_state,'idle');s.state.pixFailure=0;assert.equal((await s.post()).status,200);assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/orders')).length,1);s.db.close();});
test('parallel checkout requests cannot generate two Pix charges',async()=>{const s=setup();const result=await Promise.all([s.post(),s.post()]);assert.ok(result.every(r=>r.status===200));assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/payments/pix')).length,1);assert.equal(s.db.prepare('SELECT count(*) n FROM orders').get().n,1);s.db.close();});
test('forged paid webhook cannot deliver a key while Appmax reports pending',async()=>{const s=setup();await s.post();const response=await webhook.POST(new Request('https://store.test/api/webhooks/pix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'order_paid_by_pix',event_type:'order',data:{order_id:42,status:'aprovado',total:1000}})}));assert.equal(response.status,200);await Promise.all(globalThis.__appmaxTestTasks.splice(0));assert.equal(s.db.prepare('SELECT paid_at,delivered_at FROM orders').get().paid_at,null);assert.equal(s.db.prepare('SELECT delivered_at FROM orders').get().delivered_at,null);s.db.close();});
test('Appmax wrong paid amount blocks delivery and leaves webhook available for recovery',async()=>{const s=setup();await s.post();s.state.status='aprovado';s.state.paidTotal=10;await webhook.POST(new Request('https://store.test/api/webhooks/pix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'order_approved',event_type:'order',data:{order_id:42}})}));await Promise.all(globalThis.__appmaxTestTasks.splice(0));assert.equal(s.db.prepare('SELECT delivered_at FROM orders').get().delivered_at,null);assert.equal(s.db.prepare('SELECT count(*) n FROM appmax_webhook_jobs').get().n,1);s.db.close();});

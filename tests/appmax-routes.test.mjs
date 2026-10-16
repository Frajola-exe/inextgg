import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
globalThis.__appmaxTestEnv={APPMAX_CLIENT_ID:'merchant',APPMAX_CLIENT_SECRET:'secret',APPMAX_ENVIRONMENT:'sandbox',APPMAX_EXTERNAL_ID:'installation'};
globalThis.__appmaxTestUser={userId:'buyer',email:'buyer@example.com',displayName:'Ana Silva'};
globalThis.__appmaxTestTasks=[];
const routes=await import('../app/api/orders/route.ts');
const admin=await import('../app/api/admin/route.ts');
const store=await import('../app/api/store/route.ts');
const webhook=await import('../app/api/webhooks/pix/route.ts');
const {reconcile,reconcileInventory}=await import('../lib/server.ts');
const originalFetch=globalThis.fetch;
after(()=>{globalThis.fetch=originalFetch;});
function setup({status='pendente',pixFailure=0,paidTotal=1000,method='pix'}={}){
 globalThis.__appmaxTestEnv.ADMIN_EMAILS='buyer@example.com';
 const db=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`drizzle/${file}`,'utf8'));
 db.exec("INSERT INTO products(id,name,category,description,image,price) VALUES('p','Game','Steam','','',1000); INSERT INTO keys(id,product_id,code) VALUES('k','p','REAL-KEY')");
 function prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){const result=db.prepare(sql).run(...values);return {meta:{changes:result.changes}};}};}
 let queue=Promise.resolve();
 globalThis.__appmaxTestEnv.DB={prepare,batch(statements){const operation=queue.then(async()=>{db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}});queue=operation.catch(()=>{});return operation;}};
 const calls=[];
 const state={status,paidTotal,method,pixFailure,customerId:10,amounts:{sub_total:1000,shipping_value:0,discount:0,installment_fee:0}};
 globalThis.fetch=async(url,init)=>{
  calls.push({url,body:init?.body});
  if(url.includes('/oauth2/token'))return Response.json({access_token:'test-token',expires_in:3600});
  if(url.endsWith('/v1/customers'))return Response.json({data:{customer:{id:10}}});
  if(url.endsWith('/v1/orders'))return Response.json({data:{order:{id:42,status:'pendente'}}});
  if(url.endsWith('/v1/payments/pix'))return state.pixFailure?Response.json({}, {status:state.pixFailure}):Response.json({data:{payment:{pix_emv:'000201',pix_qrcode:'YWJj',pix_expiration_date:'2026-10-13 15:30:00'}}});
  const remoteId=url.match(/\/v1\/orders\/(\d+)$/)?.[1];
  if(remoteId)return Response.json({data:state.remoteResponses?.[remoteId]??state.remoteResponse??{order:{id:Number(remoteId),status:state.status,total_paid:state.paidTotal,amounts:state.amounts},customer:{id:state.customerId,email:'buyer@example.com'},payment:{method:state.method}},errors:state.lookupErrors});
  throw new Error(`Unexpected endpoint: ${url}`);
 };
 const body={requestKey:crypto.randomUUID(),buyer:{firstName:'Ana',lastName:'Silva',phone:'71999999999',document:'52998224725',ip:'2001:db8::1'},items:[{id:'p',quantity:1}]};
 function post(){return routes.POST(new Request('https://store.test/api/orders',{method:'POST',headers:{origin:'https://store.test','content-type':'application/json'},body:JSON.stringify(body)}));}
 return {db,body,post,state,calls};
}
function adminAction(body){return admin.POST(new Request('https://store.test/api/admin',{method:'POST',headers:{origin:'https://store.test','content-type':'application/json'},body:JSON.stringify(body)}));}
test('admin creates services and bots without key stock, supports fixed checkout and negotiable contact',async()=>{
 for(const productType of ['service','bot']) {
  const s=setup();
  const id=productType;
  const product={id,name:productType==='bot'?'Discord bot':'Discord setup',product_type:productType,price_mode:'fixed',category:'Outros',description:'Custom work',image:'',price:1000,old_price:0,active:1,automatic:1};
  assert.equal((await adminAction({action:'product',product})).status,200);
  assert.equal(s.db.prepare('SELECT automatic FROM products WHERE id=?').get(id).automatic,0);
  assert.equal((await adminAction({action:'keys',id,codes:['SHOULD-NOT-IMPORT']})).status,400);
  s.body.items=[{id,quantity:1}];
  const response=await s.post();assert.equal(response.status,200);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM keys WHERE order_id IS NOT NULL').get().n,0);
  assert.equal(s.db.prepare('SELECT total FROM orders').get().total,1000);
  s.state.status='aprovado';
  const orderId=(await response.json()).id;
  await routes.GET(new Request(`https://store.test/api/orders?id=${orderId}`));
  assert.equal(s.db.prepare('SELECT delivered_at FROM orders').get().delivered_at,null);
  assert.equal((await adminAction({action:'deliver',id:orderId})).status,200);
  assert.ok(s.db.prepare('SELECT delivered_at FROM orders').get().delivered_at);
  product.price_mode='negotiable';product.price=0;
  assert.equal((await adminAction({action:'product',product})).status,200);
  s.body.requestKey=crypto.randomUUID();
  assert.equal((await s.post()).status,400);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
  s.db.close();
 }
});
test('real checkout creates customer, digital order and Pix once; approved query delivers reserved key',async()=>{
 const s=setup();const response=await s.post();assert.equal(response.status,200);const {id}=await response.json();
 const order=s.db.prepare('SELECT * FROM orders').get();assert.equal(order.payment_provider,'appmax');assert.equal(order.payment_id,'42');assert.equal(order.qr,'000201');assert.equal(order.qr_image,'data:image/png;base64,YWJj');
 await s.post();assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/payments/pix')).length,1);
 const outgoing=JSON.parse(s.calls.find(c=>c.url.endsWith('/v1/orders')).body);assert.equal(outgoing.products_value,1000);assert.equal(outgoing.products[0].type,'digital');
 s.state.status='aprovado';const result=await routes.GET(new Request(`https://store.test/api/orders?id=${id}`));const paid=await result.json();assert.equal(paid.status,'approved');assert.equal(paid.keys[0].code,'REAL-KEY');
 s.state.status='estornado';const refunded=await routes.GET(new Request(`https://store.test/api/orders?id=${id}`));assert.deepEqual((await refunded.json()).keys,[]);
 s.db.close();
});
test('uncertain Pix outcome preserves reservation and repeated checkout never charges again',async()=>{const s=setup({pixFailure:503});const first=await s.post();assert.equal(first.status,200);const id=(await first.json()).id;assert.equal(s.db.prepare('SELECT payment_state FROM orders').get().payment_state,'unknown');await s.post();assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/payments/pix')).length,1);assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,id);s.state.status='cancelado';s.state.paidTotal=0;await routes.GET(new Request(`https://store.test/api/orders?id=${id}`));assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,null);s.db.close();});
test('definite validation rejection can retry on the same remote order',async()=>{const s=setup({pixFailure:422});assert.equal((await s.post()).status,400);assert.equal(s.db.prepare('SELECT payment_state FROM orders').get().payment_state,'idle');s.state.pixFailure=0;assert.equal((await s.post()).status,200);assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/orders')).length,1);s.db.close();});
test('parallel checkout requests cannot generate two Pix charges',async()=>{const s=setup();const result=await Promise.all([s.post(),s.post()]);assert.ok(result.every(r=>r.status===200));assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/payments/pix')).length,1);assert.equal(s.db.prepare('SELECT count(*) n FROM orders').get().n,1);s.db.close();});
test('forged paid webhook cannot deliver a key while Appmax reports pending',async()=>{const s=setup();await s.post();const response=await webhook.POST(new Request('https://store.test/api/webhooks/pix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'order_paid_by_pix',event_type:'order',data:{order_id:42,status:'aprovado',total:1000}})}));assert.equal(response.status,200);await Promise.all(globalThis.__appmaxTestTasks.splice(0));assert.equal(s.db.prepare('SELECT paid_at,delivered_at FROM orders').get().paid_at,null);assert.equal(s.db.prepare('SELECT delivered_at FROM orders').get().delivered_at,null);s.db.close();});
test('Appmax wrong paid amount blocks delivery and leaves webhook available for recovery',async()=>{const s=setup();await s.post();s.state.status='aprovado';s.state.paidTotal=10;await webhook.POST(new Request('https://store.test/api/webhooks/pix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'order_approved',event_type:'order',data:{order_id:42}})}));await Promise.all(globalThis.__appmaxTestTasks.splice(0));assert.equal(s.db.prepare('SELECT delivered_at FROM orders').get().delivered_at,null);assert.equal(s.db.prepare('SELECT count(*) n FROM appmax_webhook_jobs').get().n,1);s.db.close();});

test('definite Pix rejection releases stock and retry reacquires it before charging',async()=>{
 const s=setup({pixFailure:422});
 assert.equal((await s.post()).status,400);
 assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,null);
 s.state.pixFailure=0;
 const retry=await s.post();assert.equal(retry.status,200);
 const {id}=await retry.json();assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,id);
 s.state.status='aprovado';
 const response=await routes.GET(new Request(`https://store.test/api/orders?id=${id}`));
 assert.equal((await response.json()).keys[0].code,'REAL-KEY');s.db.close();
});

test('retry without available stock never creates another payment',async()=>{
 const s=setup({pixFailure:422});await s.post();
 s.db.exec('DELETE FROM keys');s.state.pixFailure=0;
 assert.equal((await s.post()).status,400);
 assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/payments/pix')).length,1);
 assert.equal(s.db.prepare('SELECT payment_state FROM orders').get().payment_state,'idle');s.db.close();
});

test('admin reconciliation recovers historical reservations only when no Pix was created',async()=>{
 const s=setup({pixFailure:422});await s.post();
 const order=s.db.prepare('SELECT * FROM orders').get();
 // Simulate the reservation left by the checkout before this fix.
 s.db.prepare('UPDATE keys SET order_id=?').run(order.id);
 await reconcile(order);
 assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,null);
 s.db.prepare("UPDATE orders SET payment_state='unknown' WHERE id=?").run(order.id);
 s.db.prepare('UPDATE keys SET order_id=?').run(order.id);
 await reconcile(s.db.prepare('SELECT * FROM orders').get());
 assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,order.id);s.db.close();
});

test('mismatch preserves accessible Pix and reservation, then approval recovers the same order',async()=>{
 const s=setup();const {id}=await (await s.post()).json();s.state.customerId=99;
 const response=await routes.GET(new Request(`https://store.test/api/orders?id=${id}`));
 assert.equal(response.status,200);const pending=await response.json();
 assert.equal(pending.id,id);assert.equal(pending.qr,'000201');assert.ok(pending.reconciliation_error);
 assert.deepEqual(pending.keys,[]);assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,id);
 await s.post();assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/payments/pix')).length,1);
 s.state.customerId=10;s.state.status='aprovado';s.state.paidTotal='1000';
 s.state.amounts={sub_total:'1000',shipping_value:'0',discount:'0',installment_fee:'0'};
 const recovered=await (await routes.GET(new Request(`https://store.test/api/orders?id=${id}`))).json();
 assert.equal(recovered.reconciliation_error,null);assert.equal(recovered.keys[0].code,'REAL-KEY');s.db.close();
});

test('authenticated cancellation without checkout fields releases stock and removes the Pix',async()=>{
 const s=setup();const {id}=await (await s.post()).json();
 s.state.customerId=99;
 const failed=await (await routes.GET(new Request(`https://store.test/api/orders?id=${id}`))).json();
 assert.match(failed.reconciliation_error,/identificador do cliente/);
 s.state.remoteResponse={order:{id:42,status:'cancelado',total_paid:0}};
 const cancelled=await (await routes.GET(new Request(`https://store.test/api/orders?id=${id}`))).json();
 assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.reconciliation_error,null);
 assert.equal(cancelled.qr,null);assert.equal(cancelled.qr_image,null);assert.equal(cancelled.pix_expires_at,null);
 assert.deepEqual(cancelled.keys,[]);assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,null);
 await routes.GET(new Request(`https://store.test/api/orders?id=${id}`));
 assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,null);s.db.close();
});

test('cancelled webhook recovers stock after authenticated lookup even if email and amounts changed',async()=>{
 const s=setup();const {id}=await (await s.post()).json();
 s.state.remoteResponse={order:{id:42,status:'cancelado',total_paid:'0',amounts:{sub_total:0}},customer:{id:10,email:'updated@example.com'}};
 await webhook.POST(new Request('https://store.test/api/webhooks/pix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'order_cancelled',event_type:'order',data:{order_id:42}})}));
 await Promise.all(globalThis.__appmaxTestTasks.splice(0));
 assert.equal(s.db.prepare('SELECT status FROM orders WHERE id=?').get(id).status,'cancelled');
 assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,null);
 assert.equal(s.db.prepare('SELECT count(*) n FROM appmax_webhook_jobs').get().n,0);s.db.close();
});

test('dashboard cancellation without any webhook returns stock before admin, catalog or order list is read',async()=>{
 for(const read of [()=>admin.GET(),()=>store.GET(),()=>routes.GET(new Request('https://store.test/api/orders'))]) {
  const s=setup();const {id}=await (await s.post()).json();
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM appmax_webhook_jobs').get().n,0);
  s.state.remoteResponse={order:{id:42,status:'cancelado',total_paid:'1000.00'},customer:{id:10},payment:{method:'pix',pix:{end_to_end_id:null}}};
  const response=await read();assert.equal(response.status,200);
  const data=await response.json();
  if(data.products)assert.equal(data.products[0].stock,1);
  if(data.products?.[0].reserved!=null)assert.equal(data.products[0].reserved,0);
  const orders=Array.isArray(data)?data:data.orders;
  if(orders)assert.equal(orders.find(o=>o.id===id).status,'cancelled');
  const order=s.db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  assert.equal(order.status,'cancelled');assert.equal(order.qr,null);assert.equal(order.qr_image,null);assert.equal(order.pix_expires_at,null);
  assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,null);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM appmax_webhook_jobs').get().n,0);
  s.db.close();
 }
});

test('inventory checks share a throttle and rotate past pending orders to reach later cancellations',async()=>{
 const s=setup({paidTotal:0});const {id}=await (await s.post()).json();
 const first=s.db.prepare('SELECT * FROM orders WHERE id=?').get(id);
 for(let i=1;i<=5;i++) {
  s.db.prepare('INSERT INTO orders(id,user_id,email,items,total,request_key,created_at,payment_provider,payment_id,appmax_customer_id,payment_state,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
   .run(`later-${i}`,'buyer',first.email,first.items,1000,`later-${i}`,first.created_at+i,'appmax',String(42+i),'10','done','pending');
  s.db.prepare('INSERT INTO keys(id,product_id,code,order_id) VALUES(?,?,?,?)').run(`later-key-${i}`,'p',`KEY-${i}`,`later-${i}`);
 }
 s.state.remoteResponses={'47':{order:{id:47,status:'cancelado',total_paid:0}}};
 const before=s.calls.length;
 await Promise.all([reconcileInventory(),reconcileInventory()]);
 const lookups=()=>s.calls.slice(before).filter(c=>/\/v1\/orders\/\d+$/.test(c.url));
 assert.equal(lookups().length,5);
 assert.equal(new Set(lookups().map(c=>c.url)).size,5);
 assert.equal(s.db.prepare("SELECT order_id FROM keys WHERE id='later-key-5'").get().order_id,'later-5');
 await reconcileInventory();assert.equal(lookups().length,5);
 s.db.exec("UPDATE settings SET value='0' WHERE id='appmax_inventory_sync'");
 await reconcileInventory();
 assert.equal(lookups().length,6);
 assert.equal(s.db.prepare("SELECT order_id FROM keys WHERE id='later-key-5'").get().order_id,null);
 assert.equal(s.db.prepare("SELECT status FROM orders WHERE id='later-5'").get().status,'cancelled');
 s.db.close();
});

test('inventory recovery retains failed checks for retry and never releases a pending or delivered key',async()=>{
 const s=setup({paidTotal:0});const {id}=await (await s.post()).json();
 await store.GET();assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,id);
 s.db.exec("UPDATE settings SET value='0' WHERE id='appmax_inventory_sync'; UPDATE appmax_webhook_jobs SET received_at=0");
 s.state.remoteResponse={order:{id:99,status:'cancelado',total_paid:0}};
 const failed=await store.GET();assert.equal(failed.status,200);assert.equal((await failed.json()).products[0].stock,0);
 assert.equal(s.db.prepare('SELECT COUNT(*) n FROM appmax_webhook_jobs').get().n,1);
 s.db.exec("UPDATE settings SET value='0' WHERE id='appmax_inventory_sync'; UPDATE appmax_webhook_jobs SET received_at=0");
 s.state.remoteResponse={order:{id:42,status:'cancelado',total_paid:0}};
 const recovered=await store.GET();assert.equal((await recovered.json()).products[0].stock,1);
 assert.equal(s.db.prepare('SELECT COUNT(*) n FROM appmax_webhook_jobs').get().n,0);
 s.db.prepare('UPDATE keys SET order_id=?').run(id);
 s.db.exec("UPDATE orders SET status='approved',paid_at=123,delivered_at=456; UPDATE settings SET value='0' WHERE id='appmax_inventory_sync'");
 const calls=s.calls.length;
 const delivered=await store.GET();assert.equal((await delivered.json()).products[0].stock,0);
 assert.equal(s.calls.length,calls);assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,id);
 s.db.close();
});

test('cancellation cannot free keys with contradictory identity or payment evidence',async()=>{
 const s=setup();const {id}=await (await s.post()).json();
 for(const data of [
  {order:{id:99,status:'cancelado',total_paid:0}},
  {order:{id:42,status:'cancelado',total_paid:0},customer:{id:99}},
  ...[1000,'invalid',false].map(total_paid=>({order:{id:42,status:'cancelado',total_paid}})),
  {order:{id:42,status:'cancelado',total_paid:0},payment:{paid_at:'2026-10-15 12:00:00'}}
 ]){
  s.state.remoteResponse=data;
  const order=await (await routes.GET(new Request(`https://store.test/api/orders?id=${id}`))).json();
  assert.ok(order.reconciliation_error);assert.equal(order.status,'pending');
  assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,id);
 }
 s.state.remoteResponse={order:{id:42,status:'cancelado',total_paid:0}};
 for(const field of ['paid_at','delivered_at']){
  s.db.exec('UPDATE orders SET paid_at=NULL,delivered_at=NULL');
  s.db.exec(`UPDATE orders SET ${field}=123`);
  const order=await (await routes.GET(new Request(`https://store.test/api/orders?id=${id}`))).json();
  assert.ok(order.reconciliation_error);assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,id);
 }
 s.db.close();
});

test('forged cancellation cannot release stock while authenticated status stays pending',async()=>{
 const s=setup();const {id}=await (await s.post()).json();
 await webhook.POST(new Request('https://store.test/api/webhooks/pix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'order_cancelled',event_type:'order',data:{order_id:42,status:'cancelado'}})}));
 await Promise.all(globalThis.__appmaxTestTasks.splice(0));
 assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,id);s.db.close();
});

test('Consultar provedor and buyer lookup accept serialized centavos on a one-real Pix',async()=>{
 const s=setup({paidTotal:'0.00'});
 s.db.exec("UPDATE products SET price=100 WHERE id='p'");
 const {id}=await (await s.post()).json();
 s.state.amounts={sub_total:'100.00',shipping_value:null,discount:null,installment_fee:null};
 s.state.lookupErrors=[];
 const consult=()=>admin.POST(new Request('https://store.test/api/admin',{method:'POST',headers:{origin:'https://store.test','content-type':'application/json'},body:JSON.stringify({action:'reconcile',id})}));
 assert.equal((await consult()).status,200);
 let order=await (await routes.GET(new Request(`https://store.test/api/orders?id=${id}`))).json();
 assert.equal(order.reconciliation_error,null);assert.equal(order.qr,'000201');assert.equal(order.status,'pending');assert.deepEqual(order.keys,[]);
 s.state.status='aprovado';s.state.paidTotal='1.00';
 assert.equal((await consult()).status,400);
 assert.equal(s.db.prepare('SELECT delivered_at FROM orders').get().delivered_at,null);
 s.state.paidTotal='100.00';
 assert.equal((await consult()).status,200);
 order=await (await routes.GET(new Request(`https://store.test/api/orders?id=${id}`))).json();
 assert.equal(order.reconciliation_error,null);assert.equal(order.status,'approved');assert.equal(order.keys[0].code,'REAL-KEY');
 assert.equal(s.calls.filter(c=>c.url.endsWith('/v1/payments/pix')).length,1);s.db.close();
});

test('Pix expiry with decimal zero releases the reservation once and never affects a new owner',async()=>{
 const s=setup();const {id}=await (await s.post()).json();
 s.state.remoteResponse={order:{id:42,status:'cancelado',total_paid:'0.00'}};
 const notify=()=>webhook.POST(new Request('https://store.test/api/webhooks/pix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'order_pix_expired',event_type:'order',data:{order_id:42}})}));
 assert.equal((await notify()).status,200);await Promise.all(globalThis.__appmaxTestTasks.splice(0));
 const cancelled=s.db.prepare('SELECT * FROM orders WHERE id=?').get(id);
 assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.qr,null);assert.equal(cancelled.payment_state,'done');
 assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,null);
 s.db.prepare('INSERT INTO orders(id,user_id,email,items,total,request_key,created_at) VALUES(?,?,?,?,?,?,?)').run('replacement','other','other@example.com',cancelled.items,1000,'replacement',Date.now());
 s.db.exec("UPDATE keys SET order_id='replacement'");
 assert.equal((await notify()).status,200);await Promise.all(globalThis.__appmaxTestTasks.splice(0));
 assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,'replacement');
 assert.equal(s.db.prepare('SELECT count(*) n FROM appmax_webhook_jobs').get().n,0);s.db.close();
});

test('payment refusal notification releases keys only when Appmax confirms an unpaid terminal status',async()=>{
 for(const status of ['pendente','cancelado','recusado_por_risco']) {
  const s=setup({status,paidTotal:'0.00'});const {id}=await (await s.post()).json();
  const response=await webhook.POST(new Request('https://store.test/api/webhooks/pix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'payment_not_authorized',event_type:'payment',data:{order_id:42,status:'cancelado',payment_total:0}})}));
  assert.equal(response.status,200);await Promise.all(globalThis.__appmaxTestTasks.splice(0));
  assert.ok(s.calls.some(c=>c.url.endsWith('/v1/orders/42')));
  assert.equal(s.db.prepare('SELECT order_id FROM keys').get().order_id,status==='pendente'?id:null);
  assert.equal(s.db.prepare('SELECT delivered_at FROM orders').get().delivered_at,null);s.db.close();
 }
});

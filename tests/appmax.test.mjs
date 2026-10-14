import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAppmaxClient,appmaxReady,AppmaxError} from '../lib/appmax.ts';
import {paymentMatches,appmaxStatus,pixInstructions,webhookOrderId} from '../lib/payment.ts';
import {buyerSchema} from '../lib/checkout.ts';
const config={APPMAX_CLIENT_ID:'merchant',APPMAX_CLIENT_SECRET:'secret',APPMAX_EXTERNAL_ID:'installation',APPMAX_ENVIRONMENT:'sandbox'};
const order={payment_provider:'appmax',payment_id:'42',appmax_customer_id:'10',email:'buyer@example.com',total:1000};
const payment={order:{id:42,status:'aprovado',total_paid:1000,amounts:{sub_total:1000,shipping_value:0,discount:0,installment_fee:0}},customer:{id:10,email:'buyer@example.com'},payment:{method:'pix'}};
const json=(body,status=200)=>Response.json(body,{status});
test('only configured Appmax environments can enable checkout',()=>{assert.equal(appmaxReady(config),true);for(const key of Object.keys(config))assert.equal(appmaxReady({...config,[key]:''}),false);assert.equal(appmaxReady({...config,APPMAX_ENVIRONMENT:'typo'}),false);});
test('Appmax approval requires stored order, customer, email, exact centavos and Pix',()=>{
 assert.equal(paymentMatches(order,payment),true);
 for(const data of [{...payment,order:{...payment.order,id:99}},{...payment,order:{...payment.order,total_paid:10}},{...payment,customer:{id:11,email:order.email}},{...payment,customer:{id:10,email:'other@example.com'}},{...payment,payment:{method:'creditcard'}},{...payment,payment:null},{...payment,order:{...payment.order,amounts:{...payment.order.amounts,sub_total:'1000'}}}])assert.equal(paymentMatches(order,data),false);
 assert.equal(paymentMatches({...order,payment_provider:'legacy'},payment),false);
});
test('pending order can have no payment; refunds still require order identity and amounts',()=>{assert.equal(paymentMatches(order,{...payment,order:{...payment.order,status:'pendente',total_paid:0},payment:null}),true);assert.equal(paymentMatches(order,{...payment,order:{...payment.order,status:'estornado'}}),true);});
test('status mapping prevents delivery of refunds, chargebacks and refund review',()=>{for(const status of ['aprovado','integrado','pendente_integracao'])assert.equal(appmaxStatus(status),'approved');assert.equal(appmaxStatus('autorizado'),'pending');assert.equal(appmaxStatus('cancelado'),'cancelled');assert.equal(appmaxStatus('estornado'),'refunded');assert.equal(appmaxStatus('chargeback_em_disputa'),'charged_back');assert.equal(appmaxStatus('pendente_integracao_em_analise'),'review');assert.equal(appmaxStatus('invented'),'pending');});
test('Pix parser uses documented API fields and Brasília expiration; supports guide envelope',()=>{
 const expected={qr:'000201',image:'data:image/png;base64,YWJj',expiresAt:Date.parse('2026-10-13T18:30:00Z')};
 assert.deepEqual(pixInstructions({payment:{pix_emv:'000201',pix_qrcode:'YWJj',pix_expiration_date:'2026-10-13 15:30:00'}}),expected);
 assert.deepEqual(pixInstructions({pix:{emv_code:'000201',qr_code:expected.image,expires_at:'2026-10-13 15:30:00'}}),expected);
 assert.equal(pixInstructions({payment:{pix_emv:'x',pix_qrcode:'javascript:alert(1)',pix_expiration_date:'bad'}}),null);
});
test('unsigned webhook only extracts a known order event and never approves payment',()=>{assert.equal(webhookOrderId({event:'order_paid_by_pix',event_type:'order',data:{order_id:42,status:'aprovado',total:1}}),'42');for(const payload of [{event:'order_paid',event_type:'subscription',data:{order_id:42}},{event:'order_paid',event_type:'order',data:{order_id:'../1'}},{}])assert.equal(webhookOrderId(payload),null);});
test('buyer validates document checksums and required data',()=>{const buyer={firstName:'Ana',lastName:'Silva',phone:'(71) 99999-9999',document:'529.982.247-25',ip:'2001:db8::1'};const result=buyerSchema.parse(buyer);assert.equal(result.document,'52998224725');assert.equal(result.phone,'71999999999');for(const patch of [{document:'11111111111'},{document:'52998224724'},{ip:''},{lastName:''}])assert.equal(buyerSchema.safeParse({...buyer,...patch}).success,false);});
test('OAuth uses merchant credentials; token reused; commerce uses sandbox and centavos',async()=>{
 const calls=[];const client=createAppmaxClient(config,async(url,init)=>{calls.push({url,init});return url.includes('/oauth2/token')?json({access_token:'access',expires_in:3600}):json({data:{order:{id:42}}});});
 await client('/v1/orders',{method:'POST',body:JSON.stringify({products_value:1000})});await client('/v1/orders/42');
 assert.equal(calls.length,3);assert.equal(calls[0].url,'https://auth.sandboxappmax.com.br/oauth2/token');assert.equal(calls[0].init.body.get('client_secret'),'secret');assert.equal(calls[1].init.headers.Authorization,'Bearer access');assert.equal(JSON.parse(calls[1].init.body).products_value,1000);assert.equal(calls[1].url,'https://api.sandboxappmax.com.br/v1/orders');
});
test('401 refreshes token once; network and 5xx commerce errors have uncertain outcomes',async()=>{
 let tokens=0,queries=0;const client=createAppmaxClient(config,async url=>url.includes('/oauth2/token')?json({access_token:`token${++tokens}`}):++queries===1?json({},401):json({data:{order:{id:42}}}));await client('/v1/orders/42');assert.equal(tokens,2);assert.equal(queries,2);
 for(const failure of [()=>json({},503),()=>{throw new Error('network');}]){const c=createAppmaxClient(config,async url=>url.includes('/oauth2/token')?json({access_token:'token'}):failure());await assert.rejects(c('/v1/payments/pix',{method:'POST'}),error=>error instanceof AppmaxError&&!error.definite);}
});
test('validation failures and authentication failures are safe to retry and never leak credentials',async()=>{for(const status of [401,422]){const c=createAppmaxClient(config,async url=>url.includes('/oauth2/token')?status===401?json({},401):json({access_token:'token'}):json({error:{message:'secret'}},422));await assert.rejects(c('/v1/payments/pix'),error=>error instanceof AppmaxError&&error.definite&&!error.message.includes('secret'));}});

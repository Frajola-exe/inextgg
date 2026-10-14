import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {reservationStatements} from '../lib/inventory.ts';
import {paymentMatches,appmaxStatus,pixInstructions,webhookOrderId} from '../lib/payment.ts';
function database(){const d=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())d.exec(readFileSync(`drizzle/${file}`,'utf8'));d.exec("INSERT INTO products(id,name,category,description,image,price) VALUES('p','Game','Steam','','',1000),('q','Game 2','Xbox','','',2000)");d.exec("INSERT INTO keys(id,product_id,code) VALUES('k1','p','AAA'),('k2','q','BBB')");return d;}
function reserve(d,id,items){d.exec('BEGIN');try{for(const s of reservationStatements({id,userId:'u',email:'x@test.com',requestKey:id,createdAt:0,items}))d.prepare(s.sql).run(...s.values);d.exec('COMMIT');}catch(e){d.exec('ROLLBACK');throw e;}}
const p={id:'p',name:'Game',quantity:1,price:1000,automatic:1};
test('last key can only be reserved once',()=>{const d=database();reserve(d,'one',[p]);reserve(d,'two',[p]);assert.equal(d.prepare('SELECT COUNT(*) n FROM orders').get().n,1);assert.equal(d.prepare("SELECT order_id FROM keys WHERE id='k1'").get().order_id,'one');});
test('insufficient stock on one item reserves nothing across cart',()=>{const d=database();reserve(d,'one',[p,{...p,id:'q',quantity:2}]);assert.equal(d.prepare('SELECT COUNT(*) n FROM orders').get().n,0);assert.equal(d.prepare('SELECT COUNT(*) n FROM keys WHERE order_id IS NOT NULL').get().n,0);});
test('price total comes from server product snapshot and quantity',()=>{const d=database();reserve(d,'one',[p,{...p,id:'q',name:'Other',price:2000}]);assert.equal(d.prepare('SELECT total FROM orders').get().total,3000);assert.equal(d.prepare('SELECT COUNT(*) n FROM keys WHERE order_id IS NOT NULL').get().n,2);});
test('duplicate inventory keys rollback complete import',()=>{const d=database();d.exec('BEGIN');try{d.prepare("INSERT INTO keys(id,product_id,code) VALUES('new','p','CCC')").run();d.prepare("INSERT INTO keys(id,product_id,code) VALUES('dup','p','AAA')").run();assert.fail();}catch{d.exec('ROLLBACK');}assert.equal(d.prepare("SELECT COUNT(*) n FROM keys WHERE code='CCC'").get().n,0);});

export type Item = {id:string;name:string;price:number;quantity:number;automatic:number;product_type?:"key"|"service"|"bot";variantId?:string};
const keyFilter=(item:Item) => item.variantId?"variant_id=?":"product_id=? AND variant_id IS NULL";
const keyValue=(item:Item) => item.variantId||item.id;
// Reacquire stock released after a definite provider rejection before retrying.
// The reservation and payment claim run in the same serialized transaction.
export function retryReservationStatements(order:{id:string;items:string}) {
 const items:Item[]=JSON.parse(order.items),id=order.id;
 const keyItems=items.filter(i=>!i.product_type || i.product_type==="key");
 const eligible="EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_state='idle' AND paid_at IS NULL AND qr IS NULL AND status IN ('creating','pending'))";
 const available=keyItems.map(i=>`(SELECT COUNT(*) FROM keys WHERE ${keyFilter(i)} AND order_id IS NULL)>=(?-(SELECT COUNT(*) FROM keys WHERE ${keyFilter(i)} AND order_id=?))`).join(" AND ") || "1=1";
 const availability=keyItems.flatMap(i=>[keyValue(i),i.quantity,keyValue(i),id]);
 return [...keyItems.map(i=>({
  sql:`UPDATE keys SET order_id=? WHERE id IN (SELECT id FROM keys WHERE ${keyFilter(i)} AND order_id IS NULL LIMIT (?-(SELECT COUNT(*) FROM keys WHERE ${keyFilter(i)} AND order_id=?))) AND ${eligible} AND ${available}`,
  values:[id,keyValue(i),i.quantity,keyValue(i),id,id,...availability]
 })),{
  sql:`UPDATE orders SET payment_state='processing' WHERE id=? AND payment_state='idle' AND paid_at IS NULL AND qr IS NULL AND status IN ('creating','pending') AND ${keyItems.map(i=>`(SELECT COUNT(*) FROM keys WHERE ${keyFilter(i)} AND order_id=?)=?`).join(" AND ") || "1=1"}`,
  values:[id,...keyItems.flatMap(i=>[keyValue(i),id,i.quantity])]
 }];
}
export function reservationStatements(order:{id:string;userId:string;email:string;requestKey:string;createdAt:number;items:Item[]}) {
 const {id,userId,email,requestKey,createdAt,items}=order;
 const keyItems=items.filter(i=>!i.product_type || i.product_type==="key");
 const condition=keyItems.map(i=>`(SELECT COUNT(*) FROM keys WHERE ${keyFilter(i)} AND order_id IS NULL)>=?`).join(" AND ") || "1=1";
 const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0);
 return [{sql:`INSERT INTO orders(id,user_id,email,items,total,request_key,created_at,payment_provider) SELECT ?,?,?,?,?,?,?,'appmax' WHERE ${condition}`,values:[id,userId,email,JSON.stringify(items),total,requestKey,createdAt,...keyItems.flatMap(i=>[keyValue(i),i.quantity])]},...keyItems.map(i=>({sql:`UPDATE keys SET order_id=? WHERE id IN (SELECT id FROM keys WHERE ${keyFilter(i)} AND order_id IS NULL LIMIT ?) AND EXISTS(SELECT 1 FROM orders WHERE id=?)`,values:[id,keyValue(i),i.quantity,id]}))];
}

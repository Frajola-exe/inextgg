export type Item = {id:string;name:string;price:number;quantity:number;automatic:number;product_type?:"key"|"service"|"bot"};
// Reacquire stock released after a definite provider rejection before retrying.
// The reservation and payment claim run in the same serialized transaction.
export function retryReservationStatements(order:{id:string;items:string}) {
 const items:Item[]=JSON.parse(order.items),id=order.id;
 const keyItems=items.filter(i=>!i.product_type || i.product_type==="key");
 const eligible="EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_state='idle' AND paid_at IS NULL AND qr IS NULL AND status IN ('creating','pending'))";
 const available=keyItems.map(()=>"(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id IS NULL)>=(?-(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id=?))").join(" AND ") || "1=1";
 const availability=keyItems.flatMap(i=>[i.id,i.quantity,i.id,id]);
 return [...keyItems.map(i=>({
  sql:`UPDATE keys SET order_id=? WHERE id IN (SELECT id FROM keys WHERE product_id=? AND order_id IS NULL LIMIT (?-(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id=?))) AND ${eligible} AND ${available}`,
  values:[id,i.id,i.quantity,i.id,id,id,...availability]
 })),{
  sql:`UPDATE orders SET payment_state='processing' WHERE id=? AND payment_state='idle' AND paid_at IS NULL AND qr IS NULL AND status IN ('creating','pending') AND ${keyItems.map(()=>"(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id=?)=?").join(" AND ") || "1=1"}`,
  values:[id,...keyItems.flatMap(i=>[i.id,id,i.quantity])]
 }];
}
export function reservationStatements(order:{id:string;userId:string;email:string;requestKey:string;createdAt:number;items:Item[]}) {
 const {id,userId,email,requestKey,createdAt,items}=order;
 const keyItems=items.filter(i=>!i.product_type || i.product_type==="key");
 const condition=keyItems.map(()=>"(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id IS NULL)>=?").join(" AND ") || "1=1";
 const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0);
 return [{sql:`INSERT INTO orders(id,user_id,email,items,total,request_key,created_at,payment_provider) SELECT ?,?,?,?,?,?,?,'appmax' WHERE ${condition}`,values:[id,userId,email,JSON.stringify(items),total,requestKey,createdAt,...keyItems.flatMap(i=>[i.id,i.quantity])]},...keyItems.map(i=>({sql:"UPDATE keys SET order_id=? WHERE id IN (SELECT id FROM keys WHERE product_id=? AND order_id IS NULL LIMIT ?) AND EXISTS(SELECT 1 FROM orders WHERE id=?)",values:[id,i.id,i.quantity,id]}))];
}

export type Item = {id:string;name:string;price:number;quantity:number;automatic:number};
// Reacquire stock released after a definite provider rejection before retrying.
// The reservation and payment claim run in the same serialized transaction.
export function retryReservationStatements(order:{id:string;items:string}) {
 const items:Item[]=JSON.parse(order.items),id=order.id;
 const eligible="EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_state='idle' AND paid_at IS NULL AND qr IS NULL AND status IN ('creating','pending'))";
 const available=items.map(()=>"(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id IS NULL)>=(?-(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id=?))").join(" AND ");
 const availability=items.flatMap(i=>[i.id,i.quantity,i.id,id]);
 return [...items.map(i=>({
  sql:`UPDATE keys SET order_id=? WHERE id IN (SELECT id FROM keys WHERE product_id=? AND order_id IS NULL LIMIT (?-(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id=?))) AND ${eligible} AND ${available}`,
  values:[id,i.id,i.quantity,i.id,id,id,...availability]
 })),{
  sql:`UPDATE orders SET payment_state='processing' WHERE id=? AND payment_state='idle' AND paid_at IS NULL AND qr IS NULL AND status IN ('creating','pending') AND ${items.map(()=>"(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id=?)=?").join(" AND ")}`,
  values:[id,...items.flatMap(i=>[i.id,id,i.quantity])]
 }];
}
export function reservationStatements(order:{id:string;userId:string;email:string;requestKey:string;createdAt:number;items:Item[]}) {
 const {id,userId,email,requestKey,createdAt,items}=order;
 const condition=items.map(()=>"(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id IS NULL)>=?").join(" AND ");
 const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0);
 return [{sql:`INSERT INTO orders(id,user_id,email,items,total,request_key,created_at,payment_provider) SELECT ?,?,?,?,?,?,?,'appmax' WHERE ${condition}`,values:[id,userId,email,JSON.stringify(items),total,requestKey,createdAt,...items.flatMap(i=>[i.id,i.quantity])]},...items.map(i=>({sql:"UPDATE keys SET order_id=? WHERE id IN (SELECT id FROM keys WHERE product_id=? AND order_id IS NULL LIMIT ?) AND EXISTS(SELECT 1 FROM orders WHERE id=?)",values:[id,i.id,i.quantity,id]}))];
}

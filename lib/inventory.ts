export type Item = {id:string;name:string;price:number;quantity:number;automatic:number};
export function reservationStatements(order:{id:string;userId:string;email:string;requestKey:string;createdAt:number;items:Item[]}) {
 const {id,userId,email,requestKey,createdAt,items}=order;
 const condition=items.map(()=>"(SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id IS NULL)>=?").join(" AND ");
 const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0);
 return [{sql:`INSERT INTO orders(id,user_id,email,items,total,request_key,created_at,payment_provider) SELECT ?,?,?,?,?,?,?,'appmax' WHERE ${condition}`,values:[id,userId,email,JSON.stringify(items),total,requestKey,createdAt,...items.flatMap(i=>[i.id,i.quantity])]},...items.map(i=>({sql:"UPDATE keys SET order_id=? WHERE id IN (SELECT id FROM keys WHERE product_id=? AND order_id IS NULL LIMIT ?) AND EXISTS(SELECT 1 FROM orders WHERE id=?)",values:[id,i.id,i.quantity,id]}))];
}

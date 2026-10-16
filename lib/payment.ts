// Appmax API amounts are integer centavos. Webhook amounts are deliberately ignored.
export function appmaxStatus(status: string): string {
 const statuses: Record<string,string> = {
  pendente:"pending", autorizado:"pending", aprovado:"approved", integrado:"approved",
  pendente_integracao:"approved", pendente_integracao_em_analise:"review",
  cancelado:"cancelled", estornado:"refunded", recusado_por_risco:"rejected",
  chargeback_em_tratativa:"charged_back", chargeback_em_disputa:"charged_back",
  chargeback_perdido:"charged_back", chargeback_vencido:"approved"
 };
 return statuses[status] || "pending";
}
// Amounts stay in the API's centavo unit. A decimal suffix containing only zeros
// is a serialization detail ("100.00" = 100 centavos), never a reais conversion.
function centavos(value: unknown): number | null {
 if(typeof value!=="number" && !(typeof value==="string" && /^\d+(?:\.0+)?$/.test(value))) return null;
 const amount=Number(value);
 return Number.isSafeInteger(amount) && amount>=0 ? amount : null;
}
export class PaymentMismatchError extends Error {
 constructor(reason:string) {super(`Dados do pagamento não correspondem ao pedido (${reason}). Consulte o atendimento com o número do pedido.`);}
}
// Only use with the authenticated order lookup, never directly with a webhook.
// A terminal unpaid cancellation does not need the amount breakdown or email
// required for delivery, but conflicting identity/payment evidence still blocks it.
export function cancellationMismatch(order:any,data:any): string | null {
 const remote=data?.order;
 if(order.payment_provider!=="appmax" || !order.payment_id || String(remote?.id)!==String(order.payment_id)) return "identificador do pedido";
 if(!["cancelled","rejected"].includes(appmaxStatus(remote.status))) return "status de cancelamento";
 if(data.customer?.id!=null && String(data.customer.id)!==String(order.appmax_customer_id)) return "identificador do cliente";
 // Production can retain the full order total in total_paid on cancelled Pix.
 // Only that exact Pix case is accepted; actual settlement evidence still blocks it.
 if(remote.total_paid!=null) {
  const amount=centavos(remote.total_paid);
  const cancelledPixTotal=remote.status==="cancelado" && data.payment?.method==="pix" && amount===order.total;
  if(amount===null || (amount!==0 && !cancelledPixTotal)) return "cancelamento com valor inválido ou divergente";
 }
 if(data.payment?.paid_at || data.payment?.pix?.paid_at || data.payment?.pix?.end_to_end_id || remote.paid_at || data.refund?.refunded_at) return "cancelamento com registro de pagamento";
 return null;
}
export function paymentMismatch(order: any, data: any): string | null {
 const remote=data?.order, amounts=remote?.amounts;
 if(order.payment_provider!=="appmax" || String(remote?.id)!==String(order.payment_id) || !order.payment_id) return "identificador do pedido";
 if(!order.appmax_customer_id || String(data.customer?.id)!==String(order.appmax_customer_id)) return "identificador do cliente";
 if(typeof data.customer?.email!=="string" || data.customer.email.trim().toLowerCase()!==order.email.trim().toLowerCase()) return "e-mail do cliente";
 if(data.payment?.method && data.payment.method!=="pix") return "forma de pagamento";
 // Digital Pix has no shipping, discount or installment fee unless specified.
 // The subtotal and approved total_paid must still be explicitly supplied.
 const values=[amounts?.sub_total,amounts?.shipping_value??0,amounts?.discount??0,amounts?.installment_fee??0].map(centavos);
 if(values.some(value=>value===null)) return "formato dos valores";
 const [subtotal,shipping,discount,fee]=values as number[];
 if(!Number.isSafeInteger(order.total) || BigInt(subtotal)+BigInt(shipping)-BigInt(discount)+BigInt(fee)!==BigInt(order.total)) return "valor do pedido";
 if(appmaxStatus(remote.status)==="approved" && (data.payment?.method!=="pix" || centavos(remote.total_paid)!==order.total)) return "valor pago ou confirmação Pix";
 return null;
}
export function paymentMatches(order: any, data: any) {
 return paymentMismatch(order,data)===null;
}
export function pixInstructions(data: any) {
 const pix=data?.payment || data?.pix;
 const qr=pix?.pix_emv || pix?.emv_code;
 const source=pix?.pix_qrcode || pix?.qr_code;
 const date=pix?.pix_expiration_date || pix?.expires_at;
 // Appmax dates without an offset use Brasília time.
 const timestamp=typeof date==="string" ? Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date)?date.replace(" ","T")+"-03:00":date) : NaN;
 if(typeof qr!=="string" || !qr || typeof source!=="string" || !Number.isFinite(timestamp)) return null;
 const image=source.startsWith("data:image/png;base64,")?source: /^[A-Za-z0-9+/=\s]+$/.test(source)?`data:image/png;base64,${source.replace(/\s/g,"")}`:null;
 if(!image) return null;
 return {qr,image,expiresAt:timestamp};
}
export function webhookOrderId(payload: any): string | null {
 const orderEvent=payload?.event_type==="order" && typeof payload.event==="string" && payload.event.startsWith("order_");
 const paymentEvent=payload?.event_type==="payment" && ["payment_not_authorized","payment_authorized_with_delay"].includes(payload.event);
 if(!orderEvent && !paymentEvent) return null;
 const id=payload.data?.order_id ?? payload.data?.order?.id;
 return (typeof id==="number" && Number.isSafeInteger(id) && id>0) || (typeof id==="string" && /^[1-9]\d{0,15}$/.test(id)) ? String(id) : null;
}

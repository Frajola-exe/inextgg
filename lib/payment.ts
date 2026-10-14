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
export function paymentMatches(order: any, data: any) {
 const remote=data?.order, amounts=remote?.amounts;
 if(order.payment_provider!=="appmax" || String(remote?.id)!==String(order.payment_id) || !order.payment_id) return false;
 if(String(data.customer?.id)!==String(order.appmax_customer_id) || data.customer?.email?.toLowerCase()!==order.email.toLowerCase()) return false;
 if(data.payment?.method && data.payment.method!=="pix") return false;
 if(!amounts || ![amounts.sub_total,amounts.shipping_value,amounts.discount,amounts.installment_fee].every(Number.isSafeInteger)) return false;
 if(amounts.sub_total+amounts.shipping_value-amounts.discount+amounts.installment_fee!==order.total) return false;
 if(appmaxStatus(remote.status)==="approved" && (data.payment?.method!=="pix" || remote.total_paid!==order.total)) return false;
 return true;
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
 if(payload?.event_type!=="order" || typeof payload.event!=="string" || !payload.event.startsWith("order_")) return null;
 const id=payload.data?.order_id ?? payload.data?.order?.id;
 return (typeof id==="number" && Number.isSafeInteger(id) && id>0) || (typeof id==="string" && /^[1-9]\d{0,15}$/.test(id)) ? String(id) : null;
}

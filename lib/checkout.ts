import { z } from "zod";
export function validDocument(value:string) {
 if(!/^\d{11}$|^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
 const digits=Array.from(value,Number);
 function check(length:number,weights:number[]) {const sum=digits.slice(0,length).reduce((n,d,i)=>n+d*weights[i],0);const remainder=sum%11;return digits[length]===(remainder<2?0:11-remainder);}
 return value.length===11 ? check(9,[10,9,8,7,6,5,4,3,2])&&check(10,[11,10,9,8,7,6,5,4,3,2]) : check(12,[5,4,3,2,9,8,7,6,5,4,3,2])&&check(13,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
}
const digits=z.string().transform(v=>v.replace(/\D/g,""));
export const buyerSchema=z.object({
 firstName:z.string().trim().min(2).max(80),lastName:z.string().trim().min(2).max(100),
 phone:digits.pipe(z.string().regex(/^\d{10,13}$/)),document:digits.refine(validDocument,"Informe um CPF ou CNPJ válido."),ip:z.string().ip()
});
export const checkoutSchema=z.object({requestKey:z.string().uuid(),buyer:buyerSchema,items:z.array(z.object({id:z.string().min(1),quantity:z.number().int().min(1).max(5)})).min(1).max(10)});

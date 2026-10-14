"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { buyerSchema } from "../lib/checkout";
import { money } from "../lib/catalog";

type Buyer={firstName:string;lastName:string;phone:string;document:string;ip:string};
declare global {interface Window {AppmaxScripts?:{init:(options:{externalId:string;onIp:(data:{ip:string})=>void;onError:()=>void})=>void};}}
export function AppmaxCheckout({total,name,environment,externalId,busy,onSubmit}:{total:number;name:string;environment:string;externalId:string;busy:boolean;onSubmit:(buyer:Buyer)=>void}) {
 const parts=(name||"").trim().split(/\s+/);
 const [buyer,setBuyer]=useState<Buyer>({firstName:parts[0]||"",lastName:parts.slice(1).join(" "),phone:"",document:"",ip:""});
 const [error,setError]=useState(""),[retry,setRetry]=useState(0);
 const inFlight=useRef(false);
 useEffect(()=>{if(!busy)inFlight.current=false;},[busy]);
 useEffect(()=>{
  let active=true,ipReady=false;
  const source=`https://scripts.${environment==="production"?"appmax.com.br":"sandboxappmax.com.br"}/appmax.min.js`;
  let script=document.querySelector<HTMLScriptElement>('script[data-appmax-sdk]');
  function failed(){if(active)setError("Não foi possível preparar o pagamento. Tente novamente.");}
  function init(){if(!active)return;try{window.AppmaxScripts?.init({externalId,onIp:({ip})=>{if(active){ipReady=true;setBuyer(prev=>({...prev,ip}));setError("");}},onError:failed});}catch{failed();}}
  if(!script){script=document.createElement("script");script.src=source;script.async=true;script.dataset.appmaxSdk="true";document.head.appendChild(script);}
  script.addEventListener("load",init);script.addEventListener("error",failed);
  if(window.AppmaxScripts)init();
  const timer=setTimeout(()=>{if(active&&!ipReady)failed();},15000);
  return()=>{active=false;clearTimeout(timer);script?.removeEventListener("load",init);script?.removeEventListener("error",failed);};
 },[environment,externalId,retry]);
 function field(key:keyof Buyer,label:string,autoComplete:string,inputMode:"text"|"tel"|"numeric"="text") {
  return <label>{label}<input required name={key} autoComplete={autoComplete} inputMode={inputMode} maxLength={key==="document"?18:key==="phone"?20:100} value={buyer[key]} onChange={e=>{setBuyer({...buyer,[key]:e.target.value});}}/></label>;
 }
 return <>
  <form data-appmax-customer hidden onSubmit={e=>e.preventDefault()}/>
  <form className="buyer-form" onSubmit={e=>{e.preventDefault();if(inFlight.current)return;const parsed=buyerSchema.safeParse(buyer);if(!parsed.success){setError(parsed.error.issues.some(i=>i.path[0]==="document")?"Informe um CPF ou CNPJ válido.":"Confira seus dados e aguarde a preparação do pagamento.");return;}setError("");inFlight.current=true;onSubmit(parsed.data);}}>
   <p className="muted">Preencha seus dados para gerar o Pix. A key será liberada após a confirmação do pagamento.</p>
   <div className="buyer-name">{field("firstName","Nome","given-name")}{field("lastName","Sobrenome","family-name")}</div>
   {field("phone","Telefone com DDD","tel-national","tel")}{field("document","CPF ou CNPJ","off","numeric")}
   <p className="muted">Seus dados serão enviados à Appmax para processar o pagamento.</p>
   {error && <><p className="error" role="alert">{error}</p>{!buyer.ip && <button type="button" className="secondary full" onClick={()=>{document.querySelector('script[data-appmax-sdk]')?.remove();setError("");setRetry(n=>n+1);}}>Tentar preparar novamente</button>}</>}
   <button className="primary full" type="submit" disabled={busy||!buyer.ip}>{busy||!buyer.ip?<LoaderCircle className="spin" size={18}/>:<ShieldCheck size={18}/>} {busy?"Gerando Pix…":!buyer.ip?"Preparando pagamento…":`Gerar Pix • ${money(total)}`}</button>
  </form>
 </>;
}
export function PixExpiry({expiresAt}:{expiresAt:number}) {
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const seconds=Math.max(0,Math.ceil((expiresAt-now)/1000));
 return <p className="muted center">{seconds>0?`Tempo restante: ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}.` : "O prazo deste Pix terminou. Consulte o pedido para confirmar o status."} Vencimento: {new Date(expiresAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}. A entrega é liberada após confirmação.</p>;
}

export type AppmaxConfig = {APPMAX_CLIENT_ID?:string;APPMAX_CLIENT_SECRET?:string;APPMAX_ENVIRONMENT?:string;APPMAX_EXTERNAL_ID?:string};
export function appmaxReady(config:AppmaxConfig) {
 return !!(config.APPMAX_CLIENT_ID && config.APPMAX_CLIENT_SECRET && config.APPMAX_EXTERNAL_ID && ["sandbox","production"].includes(config.APPMAX_ENVIRONMENT || ""));
}
export class AppmaxError extends Error {
 definite: boolean;
 constructor(message:string,definite=false) {super(message);this.definite=definite;}
}
export function createAppmaxClient(config:AppmaxConfig, transport:typeof fetch=fetch) {
 if(!appmaxReady(config)) throw new AppmaxError("Pix Appmax ainda não configurado. Nenhuma cobrança foi realizada.",true);
 const host=config.APPMAX_ENVIRONMENT==="production"?"appmax.com.br":"sandboxappmax.com.br";
 let token="", expires=0;
 async function authenticate() {
  const response=await transport(`https://auth.${host}/oauth2/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:new URLSearchParams({grant_type:"client_credentials",client_id:config.APPMAX_CLIENT_ID!,client_secret:config.APPMAX_CLIENT_SECRET!}),signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new AppmaxError("Não foi possível autenticar na Appmax. Confira as credenciais do lojista.",true);
  const data:any=await response.json();
  if(typeof data.access_token!=="string" || !data.access_token) throw new AppmaxError("A Appmax não retornou o token de acesso.",true);
  token=data.access_token;expires=Date.now()+Math.max(0,Number(data.expires_in || 3600)-60)*1000;
 }
 return async function appmax(path:string,init:RequestInit={}) {
  try {if(!token || Date.now()>=expires) await authenticate();}catch(error){if(error instanceof AppmaxError)throw error;throw new AppmaxError("Não foi possível conectar à autenticação da Appmax.",true);}
  async function send() {return transport(`https://api.${host}${path}`,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),Authorization:`Bearer ${token}`,"Content-Type":"application/json",Accept:"application/json"},signal:AbortSignal.timeout(8000)});}
  let response:Response;
  try {response=await send();if(response.status===401){await authenticate();response=await send();}}catch(error){if(error instanceof AppmaxError)throw error;throw new AppmaxError("A Appmax não respondeu. Consulte o pedido antes de tentar outra cobrança.");}
  if(!response.ok) throw new AppmaxError(`A Appmax recusou a operação (HTTP ${response.status}). Confira os dados e a configuração.`,[400,401,403,404,422,429].includes(response.status));
  try {const body:any=await response.json();if(!body.data || body.error || body.errors)throw new Error();return body.data;}catch{throw new AppmaxError("A Appmax retornou uma resposta inesperada. Consulte o pedido antes de tentar outra cobrança.");}
 };
}

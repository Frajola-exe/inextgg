export type Product = { id:string; name:string; category:string; description:string; image:string; price:number; old_price:number; active:number; automatic:number; stock:number; product_type:"key"|"service"|"bot"; price_mode:"fixed"|"negotiable" };
export const categories = ["Steam", "PlayStation", "Xbox", "Outros"];
export const productTypes = {key:"Key de jogo",service:"Serviço",bot:"Bot para Discord"} as const;
export const available = (product:Product) => product.product_type!=="key" || product.stock>0;
export const fixedPrice = (product:Product) => product.price_mode==="fixed";
export const platformPath = (category:string) => `/plataforma/${category.toLowerCase()}`;
export const productPath = (id:string) => `/jogo/${encodeURIComponent(id)}`;
export const money = (n:number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(n/100);

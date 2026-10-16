export type ProductVariant = {id:string;product_id:string;name:string;price:number;quantity:number;stock:number};
export type Product = { id:string; name:string; category:string; description:string; image:string; price:number; old_price:number; active:number; automatic:number; stock:number; product_type:"key"|"service"|"bot"; price_mode:"fixed"|"negotiable";variants?:ProductVariant[] };
export const categories = ["Steam", "PlayStation", "Xbox", "Outros"];
export const productTypes = {key:"Key de jogo",service:"Serviços digitais",bot:"Bots Discord"} as const;
export const otherSubcategories = {service:"Serviços digitais",bot:"Bots Discord"} as const;
export const matchesCategory = (product:Product, category:string, subcategory="Todos") =>
 category==="Todos" || (product.category===category && (category!=="Outros" || subcategory==="Todos" || product.product_type===subcategory));
export const available = (product:Product) => product.product_type!=="key" || (product.variants?.length?product.variants.some(v=>v.stock>0):product.stock>0);
export const fixedPrice = (product:Product) => product.price_mode==="fixed";
export const platformPath = (category:string) => `/plataforma/${category.toLowerCase()}`;
export const categoryPath = (category:string) => category==="Serviços"?"/categoria/servicos":category==="Bots"?"/categoria/bots":platformPath(category);
export const storeCategories = [...categories,"Serviços","Bots"];
export const productPath = (id:string) => `/jogo/${encodeURIComponent(id)}`;
export const money = (n:number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(n/100);

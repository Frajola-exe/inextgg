export type ProductVariant = {id:string;product_id:string;name:string;price:number;quantity:number;stock:number};
export type KeyType = "steam"|"xbox"|"psn";
export const keyTypes:Record<KeyType,{label:string;category:string}> = {steam:{label:"STEAM KEY",category:"Steam"},xbox:{label:"XBOX KEY",category:"Xbox"},psn:{label:"PSN KEY",category:"PlayStation"}};
export const keyTypeForCategory = (category:string):KeyType|undefined => (Object.keys(keyTypes) as KeyType[]).find(type=>keyTypes[type].category===category);
export const productTypeLabel = (product:Product) => {
 if(product.product_type!=="key") return productTypes[product.product_type];
 const type=product.key_type||keyTypeForCategory(product.category);
 return type?keyTypes[type].label:productTypes.key;
};
export type Product = { id:string; name:string; category:string; key_type?:KeyType|null; description:string; image:string; price:number; old_price:number; active:number; automatic:number; coming_soon:number; stock:number; product_type:"key"|"service"|"bot"; price_mode:"fixed"|"negotiable";variants?:ProductVariant[] };
export const categories = ["Steam", "PlayStation", "Xbox"];
export const productTypes = {key:"Key de jogo",service:"Serviços digitais",bot:"Bots Discord"} as const;
export const serviceSubcategories = {service:"Serviços digitais",bot:"Bots Discord"} as const;
export const matchesCategory = (product:Product, category:string, subcategory="Todos") =>
 category==="Em breve"?!!product.coming_soon:
 !product.coming_soon && (category==="Todos" || (product.category===category && (category!=="Serviços" || subcategory==="Todos" || product.product_type===subcategory)));
export const available = (product:Product) => !product.coming_soon && (product.product_type!=="key" || (product.variants?.length?product.variants.some(v=>v.stock>0):product.stock>0));
export const fixedPrice = (product:Product) => product.price_mode==="fixed";
export const platformPath = (category:string) => `/plataforma/${category.toLowerCase()}`;
export const categoryPath = (category:string) => category==="Serviços"?"/categoria/servicos":category==="Em breve"?"/categoria/em-breve":platformPath(category);
export const storeCategories = [...categories,"Serviços","Em breve"];
export const productPath = (id:string) => `/jogo/${encodeURIComponent(id)}`;
export const money = (n:number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(n/100);

export type Product = { id:string; name:string; category:string; description:string; image:string; price:number; old_price:number; active:number; automatic:number; stock:number };
export const categories = ["Steam", "PlayStation", "Xbox", "Outros"];
export const platformPath = (category:string) => `/plataforma/${category.toLowerCase()}`;
export const productPath = (id:string) => `/jogo/${encodeURIComponent(id)}`;
export const money = (n:number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(n/100);

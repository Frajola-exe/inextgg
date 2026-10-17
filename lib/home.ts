import { matchesCategory, type Product } from "./catalog";

export const categoryProducts = (products:Product[], category:string, subcategory="Todos") => products.filter(product =>
 category==="Em breve"?!!product.coming_soon:
 product.coming_soon?false:
 category==="Serviços"?product.product_type==="service":
 category==="Bots"?product.product_type==="bot":
 matchesCategory(product,category,subcategory)
);

export const categoryHighlights = (products:Product[], category:string) => categoryProducts(products,category).slice(0,4);

export function selectCarouselGames(products:Product[], previousIds:string[]=[], count=3, random=Math.random):Product[] {
 const games=products.filter(product=>product.product_type==="key" && !product.coming_soon);
 const slideCount=games.length>1?Math.min(count,games.length-1):Math.min(count,games.length);
 const shuffled=[...games];
 for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 if(games.length>slideCount && previousIds.length){
  const fresh=shuffled.filter(product=>!previousIds.includes(product.id));
  const previous=shuffled.filter(product=>previousIds.includes(product.id));
  return [...fresh,...previous].slice(0,slideCount);
 }
 if(games.length>1 && previousIds.length && shuffled[0]?.id===previousIds[0]){
  [shuffled[0],shuffled[1]]=[shuffled[1],shuffled[0]];
 }
 return shuffled.slice(0,slideCount);
}

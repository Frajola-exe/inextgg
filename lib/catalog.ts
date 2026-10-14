export type Product = { id:string; name:string; category:string; description:string; image:string; price:number; old_price:number; active:number; automatic:number; stock:number };
export const categories = ["Steam", "PlayStation", "Xbox", "Outros"];
export const platformPath = (category:string) => `/plataforma/${category.toLowerCase()}`;
export const productPath = (id:string) => `/jogo/${encodeURIComponent(id)}`;
export const money = (n:number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(n/100);
export const samples: Product[] = [
 {id:"demo-1",name:"Cyberpunk 2077",category:"Steam",price:9990,old_price:19990,image:"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg",description:"Explore Night City em um RPG de mundo aberto. Edição padrão • PC • Brasil.",active:1,automatic:1,stock:0},
 {id:"demo-2",name:"Red Dead Redemption 2",category:"Steam",price:8990,old_price:29990,image:"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/header.jpg",description:"Uma jornada épica pelo Velho Oeste. Edição padrão • PC • Brasil.",active:1,automatic:1,stock:0},
 {id:"demo-3",name:"God of War",category:"PlayStation",price:7990,old_price:14990,image:"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1593500/header.jpg",description:"Uma aventura entre deuses e monstros. Produto de exemplo: configure edição, região e plataforma antes de vender.",active:1,automatic:1,stock:0},
 {id:"demo-4",name:"Forza Horizon 5",category:"Xbox",price:11990,old_price:24990,image:"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1551360/header.jpg",description:"Seu próximo festival de velocidade. Produto de exemplo: configure edição e região antes de vender.",active:1,automatic:1,stock:0},
 {id:"demo-5",name:"ELDEN RING",category:"Steam",price:14990,old_price:24990,image:"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg",description:"Descubra as Terras Intermédias. Edição padrão • PC • Brasil.",active:1,automatic:1,stock:0},
 {id:"demo-6",name:"Hogwarts Legacy",category:"Steam",price:8990,old_price:24990,image:"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/990080/header.jpg",description:"Viva sua própria história no mundo da magia. Edição padrão • PC • Brasil.",active:1,automatic:1,stock:0},
 {id:"demo-7",name:"Marvel’s Spider-Man",category:"PlayStation",price:12990,old_price:24990,image:"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1817070/header.jpg",description:"A cidade precisa de um herói. Produto de exemplo: configure edição e região antes de vender.",active:1,automatic:1,stock:0},
 {id:"demo-8",name:"Minecraft",category:"Outros",price:6990,old_price:9990,image:"",description:"Construa sua próxima aventura. Produto de exemplo: configure edição e região antes de vender.",active:1,automatic:1,stock:0}
];

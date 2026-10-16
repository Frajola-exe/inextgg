import { notFound } from "next/navigation";
import Store from "../../store";

export default async function CategoryPage({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;
 const category=slug==="servicos"?"Serviços":slug==="bots"?"Bots":null;
 if(!category) notFound();
 return <Store categoryPage={category}/>;
}

import { notFound, redirect } from "next/navigation";
import Store from "../../store";

export default async function CategoryPage({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;
 if(slug==="bots") redirect("/categoria/servicos");
 const category=slug==="servicos"?"Serviços":slug==="em-breve"?"Em breve":null;
 if(!category) notFound();
 return <Store categoryPage={category}/>;
}

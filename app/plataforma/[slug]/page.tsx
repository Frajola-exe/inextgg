import { notFound } from "next/navigation";
import Store from "../../store";
import { categories } from "../../../lib/catalog";

export default async function PlatformPage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const platform=categories.find(category=>category.toLowerCase()===slug);
  if(!platform) notFound();
  return <Store platform={platform}/>;
}

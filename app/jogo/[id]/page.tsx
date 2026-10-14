import Store from "../../store";

export default async function ProductPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <Store productId={id}/>;
}

import { serverApi, Catalog } from "@/lib/api";
import { ProductCard } from "@/components/product-card";
export default async function Collection({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await serverApi<Catalog>(
    `/catalog/products?collection=${slug}&limit=24`,
  );
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">THE FIELDWORK COLLECTIONS</p>
        <h1>{slug.replaceAll("-", " ")}</h1>
      </div>
      <section className="section product-grid">
        {data.items.map((p) => (
          <ProductCard product={p} key={p.id} />
        ))}
      </section>
    </>
  );
}

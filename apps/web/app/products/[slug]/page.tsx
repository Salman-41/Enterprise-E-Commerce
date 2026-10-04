import { Engagement } from "@/components/engagement";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverApi, Product, Catalog, productImage } from "@/lib/api";
import { BuyPanel, Gallery } from "@/components/buy-panel";
import { ProductCard } from "@/components/product-card";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await serverApi<Product>(
    `/catalog/products/${(await params).slug}`,
  );
  return {
    title: p.name,
    description: p.description,
    alternates: { canonical: `/products/${p.slug}` },
  };
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let p: Product;
  try {
    p = await serverApi<Product>(`/catalog/products/${slug}`);
  } catch {
    notFound();
  }
  const related = await serverApi<Catalog>(
    `/catalog/products?category=${p.category?.slug || ""}&limit=4`,
  );
  const json = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: productImage(p),
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: p.price / 100,
      url: `/products/${slug}`,
    },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(json).replaceAll("<", "\u003c"),
        }}
      />
      <section className="product-detail">
        <Gallery
          images={p.media?.map((m) => m.url) || [productImage(p)]}
          name={p.name}
        />
        <div className="product-information">
          <div className="breadcrumbs">
            <Link href="/shop">The edit</Link>
            <span>/</span>
            <span>{p.category?.name}</span>
          </div>
          <p className="eyebrow">{p.brand?.name || "FIELDWORK SELECTED"}</p>
          <h1>{p.name}</h1>
          <p className="product-description">{p.description}</p>
          <BuyPanel product={p} />
          <div className="details-list">
            <details open>
              <summary>Details & materials</summary>
              <p>{p.description}</p>
              {p.specifications && (
                <ul>
                  {Object.entries(p.specifications).map(([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  ))}
                </ul>
              )}
            </details>
            <details>
              <summary>Delivery & returns</summary>
              <p>
                Standard delivery in 3–5 working days. Express delivery in 1–2
                working days. Return eligible unused goods within 30 days.{" "}
                <Link href="/shipping">Delivery information ↗</Link>
              </p>
            </details>
            <details>
              <summary>Care & sizing</summary>
              <p>
                Review the selected variant before ordering. Keep your object
                clean and dry, and follow the care instructions supplied with
                it.
              </p>
            </details>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <h2>From everyday use.</h2>
          <span>{p.reviews?.length || 0} customer reviews</span>
        </div>
        <div className="review-grid">
          {p.reviews?.map((r) => (
            <article className="review-card" key={r.id}>
              <span aria-label={`${r.rating} out of 5 stars`}>
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </span>
              <h3>{r.title || "Thoughtfully made"}</h3>
              <p>{r.body}</p>
              <small>
                {r.user?.name || "Fieldwork customer"}
                {r.verified ? " · Verified purchase" : ""}
              </small>
            </article>
          ))}
        </div>
      </section>
      {p.questions && p.questions.length > 0 && (
        <section className="section">
          <h2 className="section-title">Questions, answered.</h2>
          {p.questions.map((q) => (
            <details key={q.id}>
              <summary>{q.question}</summary>
              {q.answers.map((a) => (
                <p key={a.id}>{a.body}</p>
              ))}
            </details>
          ))}
        </section>
      )}
      <Engagement productId={p.id} />
      <section className="section">
        <div className="section-heading">
          <h2>In good company.</h2>
          <Link href="/shop">Explore more ↗</Link>
        </div>
        <div className="product-grid">
          {related.items
            .filter((x) => x.id !== p.id)
            .map((x) => (
              <ProductCard key={x.id} product={x} />
            ))}
        </div>
      </section>
    </>
  );
}

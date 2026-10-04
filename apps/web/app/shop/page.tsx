import Link from "next/link";
import { serverApi, Catalog } from "@/lib/api";
import { ProductCard } from "@/components/product-card";
export const metadata = { title: "The complete edit" };
export default async function Shop({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (typeof v === "string" && v.trim()) query.set(k, v);
  if (!query.has("limit")) query.set("limit", "16");
  const [data, categories] = await Promise.all([
    serverApi<Catalog>(`/catalog/products?${query}`),
    serverApi<{ items: { name: string; slug: string }[] }>(
      "/catalog/categories",
    ),
  ]);
  const page = Number(params.page) || 1;
  const pageLink = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(p));
    return `/shop?${q}`;
  };
  return (
    <>
      <div className="page-head">
        <div className="breadcrumbs">
          <Link href="/">Home</Link>
          <span>/</span>
          <span>The edit</span>
        </div>
        <p className="eyebrow">OBJECTS THAT EARN THEIR PLACE</p>
        <h1>{params.q ? `Results for “${params.q}”` : "The complete edit."}</h1>
        <p>
          Good design, useful details and a place in your everyday. Find your
          next favourite.
        </p>
      </div>
      <div className="shop-layout">
        <form className="filters" action="/shop">
          <label>
            Search
            <input
              name="q"
              defaultValue={String(params.q || "")}
              placeholder="Find an object"
            />
          </label>
          <label>
            Category
            <select
              name="category"
              defaultValue={String(params.category || "")}
            >
              <option value="">All categories</option>
              {categories.items.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Brand
            <select name="brand" defaultValue={String(params.brand || "")}>
              <option value="">All brands</option>
              {data.facets?.brands?.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Minimum price (USD)
            <input
              type="number"
              name="minPrice"
              min="0"
              defaultValue={String(params.minPrice || "")}
            />
          </label>
          <label>
            Maximum price (USD)
            <input
              type="number"
              name="maxPrice"
              min="0"
              defaultValue={String(params.maxPrice || "")}
            />
          </label>
          <label>
            Sort by
            <select name="sort" defaultValue={String(params.sort || "newest")}>
              <option value="newest">Newest first</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="rating">Highest rated</option>
            </select>
          </label>
          <label>
            Availability
            <select name="inStock" defaultValue={String(params.inStock || "")}>
              <option value="">All objects</option>
              <option value="true">In stock only</option>
            </select>
          </label>
          <button className="button">Apply filters ↗</button>
          <Link href="/shop">Clear filters</Link>
        </form>
        <div>
          <div className="shop-toolbar">
            <span>{data.total} considered objects</span>
            <span>Page {page}</span>
          </div>
          {data.items.length ? (
            <div className="product-grid">
              {data.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>Nothing here just yet.</h2>
              <p>Try a broader search or clear a filter.</p>
              <Link href="/shop" className="button">
                Explore all objects ↗
              </Link>
            </div>
          )}
          <nav className="pagination" aria-label="Product pages">
            {page > 1 && <Link href={pageLink(page - 1)}>← Previous</Link>}
            <span>
              {page} / {Math.max(1, Math.ceil(data.total / data.limit))}
            </span>
            {page * data.limit < data.total && (
              <Link href={pageLink(page + 1)}>Next →</Link>
            )}
          </nav>
        </div>
      </div>
    </>
  );
}

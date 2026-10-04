import Link from "next/link";
import Image from "next/image";
import { Product, money, productImage } from "@/lib/api";
export function ProductCard({ product: p }: { product: Product }) {
  return (
    <article className="product-card">
      <Link className="product-picture" href={`/products/${p.slug}`}>
        <Image
          src={productImage(p)}
          alt={p.name}
          width={640}
          height={760}
          sizes="(max-width:600px) 50vw,(max-width:1000px) 33vw,25vw"
        />
        {p.compareAtPrice && p.compareAtPrice > p.price ? (
          <span className="product-label">Considered price</span>
        ) : null}
        <span className="card-arrow">↗</span>
      </Link>
      <div className="product-meta">
        <div>
          <p>{p.brand?.name || p.category?.name || "The Fieldwork edit"}</p>
          <Link href={`/products/${p.slug}`}>
            <h3>{p.name}</h3>
          </Link>
        </div>
        <span>{money(p.price)}</span>
      </div>
    </article>
  );
}

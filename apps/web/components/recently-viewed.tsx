"use client";
import { useEffect, useState } from "react";
import { api, Product } from "@/lib/api";
import { ProductCard } from "./product-card";
export function RecentlyViewed() {
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    let active = true;
    try {
      const slugs: string[] = JSON.parse(
        localStorage.getItem("fieldwork-recent") || "[]",
      );
      Promise.all(
        slugs
          .slice(0, 4)
          .map((slug) =>
            api<Product>(`/catalog/products/${slug}`).catch(() => null),
          ),
      ).then((result) => {
        if (active) setItems(result.filter((x): x is Product => x !== null));
      });
    } catch {
      /* Storage may be disabled in privacy mode. */
    }
    return () => {
      active = false;
    };
  }, []);
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="section-heading">
        <h2>A second look.</h2>
        <span>Recently viewed</span>
      </div>
      <div className="product-grid">
        {items.map((p) => (
          <ProductCard product={p} key={p.id} />
        ))}
      </div>
    </section>
  );
}

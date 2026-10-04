"use client";
import { useEffect, useState } from "react";
import { api, Product, money } from "@/lib/api";
import { ProductCard } from "./product-card";
export function Compare() {
  const [items, setItems] = useState<Product[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const slugs: string[] = JSON.parse(
      localStorage.getItem("fieldwork-compare") || "[]",
    );
    Promise.all(slugs.map((s) => api<Product>(`/catalog/products/${s}`)))
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">SIDE BY SIDE</p>
        <h1>Choose with intention.</h1>
        <p>Compare up to four objects from their product pages.</p>
      </div>
      <section className="section">
        {error && <p role="alert">{error}</p>}
        <div className="product-grid">
          {items.map((p) => (
            <div key={p.id}>
              <ProductCard product={p} />
              <div className="details-list">
                <p>{p.description}</p>
                <p>
                  {p.variants?.length} variants · From {money(p.price)}
                </p>
                <button
                  className="button secondary"
                  onClick={() => {
                    const slugs = items
                      .filter((x) => x.id !== p.id)
                      .map((x) => x.slug);
                    localStorage.setItem(
                      "fieldwork-compare",
                      JSON.stringify(slugs),
                    );
                    setItems(items.filter((x) => x.id !== p.id));
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        {!items.length && (
          <p>Nothing to compare yet. Select Compare on any product page.</p>
        )}
      </section>
    </>
  );
}

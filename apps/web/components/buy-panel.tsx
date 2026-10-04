"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, money, Product } from "@/lib/api";
export function BuyPanel({ product: p }: { product: Product }) {
  const router = useRouter();
  const [selected, setSelected] = useState(
    p.variants?.find((variant) => (variant.available ?? variant.stock ?? 0) > 0)
      ?.id ||
      p.variants?.[0]?.id ||
      "",
  );
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const variant = p.variants?.find((v) => v.id === selected);
  const stock = variant?.available ?? variant?.stock ?? 0;
  useEffect(() => {
    const ids: string[] = JSON.parse(
      localStorage.getItem("fieldwork-recent") || "[]",
    );
    localStorage.setItem(
      "fieldwork-recent",
      JSON.stringify([p.slug, ...ids.filter((x) => x !== p.slug)].slice(0, 12)),
    );
    void api("/catalog/events", {
      method: "POST",
      body: JSON.stringify({ type: "product_view", productId: p.id }),
    }).catch(() => {});
  }, [p.slug]);
  async function add(buy = false) {
    setBusy(true);
    try {
      await api("/cart/items", {
        method: "POST",
        body: JSON.stringify({ variantId: selected, quantity }),
      });
      setMessage("Added to your bag.");
      if (buy) router.push("/checkout");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function wish() {
    try {
      await api("/account/wishlist", {
        method: "POST",
        body: JSON.stringify({ productId: p.id }),
      });
      setMessage("Saved to your wishlist.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function compare() {
    const saved: string[] = JSON.parse(
      localStorage.getItem("fieldwork-compare") || "[]",
    );
    localStorage.setItem(
      "fieldwork-compare",
      JSON.stringify([...new Set([...saved, p.slug])].slice(0, 4)),
    );
    router.push("/compare");
  }
  return (
    <div className="buy-panel">
      <p className="product-price">
        {money(variant?.price ?? p.price)}
        {p.compareAtPrice && <del>{money(p.compareAtPrice)}</del>}
      </p>
      <span className="eyebrow" style={{ marginBottom: 0 }}>
        CHOOSE YOUR VARIANT
      </span>
      <div
        className="variant-options"
        role="group"
        aria-label="Product variants"
      >
        {p.variants?.map((v) => (
          <button
            key={v.id}
            className={selected === v.id ? "selected" : ""}
            aria-pressed={selected === v.id}
            onClick={() => {
              setSelected(v.id);
              setQuantity(1);
            }}
          >
            {v.name ||
              v.title ||
              [v.color, v.size].filter(Boolean).join(" / ") ||
              v.sku}
          </button>
        ))}
      </div>
      <span className="stock">
        {stock > 0
          ? `${stock <= 5 ? `Only ${stock} left` : "In stock"} · Ships within 2 working days`
          : "Currently out of stock"}
      </span>
      <div className="quantity" aria-label="Quantity">
        <button
          aria-label="Decrease quantity"
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
        >
          −
        </button>
        <span>{quantity}</span>
        <button
          aria-label="Increase quantity"
          onClick={() => setQuantity(Math.min(stock, quantity + 1))}
          disabled={quantity >= stock}
        >
          +
        </button>
      </div>
      <button
        className="button"
        disabled={busy || !selected || stock < 1}
        onClick={() => add()}
      >
        {busy ? "Adding…" : "Add to bag"}
        <span>↗</span>
      </button>
      {stock > 0 ? (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => add(true)}
        >
          Buy now ↗
        </button>
      ) : (
        <StockAlert variantId={selected} />
      )}
      <div className="inline-actions">
        <button onClick={wish}>♡ Save to wishlist</button>
        <button onClick={compare}>Compare</button>
      </div>
      <p className="message" role="status">
        {message}
      </p>
      <p style={{ fontSize: 11, color: "var(--muted)" }}>
        Free shipping over $150 · 30-day returns
        <br />
        Local demo checkout. No real payment is collected.
      </p>
    </div>
  );
}
function StockAlert({ variantId }: { variantId: string }) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/catalog/back-in-stock", {
            method: "POST",
            body: JSON.stringify({
              variantId,
              email: new FormData(e.currentTarget).get("email"),
            }),
          });
          setMessage("We’ll email you when it’s back.");
        } catch (e) {
          setMessage((e as Error).message);
        }
      }}
    >
      <label className="field">
        Back-in-stock email
        <input name="email" type="email" required />
      </label>
      <button className="button secondary">Notify me ↗</button>
      <p role="status">{message}</p>
    </form>
  );
}
export function Gallery({ images, name }: { images: string[]; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState(images[0]);
  return (
    <>
      <div className="gallery">
        {images.map((src, i) => (
          <button
            key={i}
            onClick={() => {
              setImage(src);
              dialog.current?.showModal();
            }}
            aria-label={`Enlarge ${name}, view ${i + 1}`}
          >
            <Image
              src={src}
              alt={`${name}, view ${i + 1}`}
              width={700}
              height={800}
              sizes="(max-width:760px) 90vw,55vw"
            />
          </button>
        ))}
      </div>
      <dialog ref={dialog}>
        <button
          onClick={() => dialog.current?.close()}
          style={{ float: "right" }}
          aria-label="Close enlarged image"
        >
          Close ×
        </button>
        <div className="modal-picture">
          <Image
            src={image}
            alt={name}
            width={900}
            height={1000}
            sizes="90vw"
          />
        </div>
      </dialog>
    </>
  );
}

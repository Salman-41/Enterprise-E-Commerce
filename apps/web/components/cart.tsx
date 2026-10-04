"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
export type CartView = {
  id: string;
  items: {
    id: string;
    variantId: string;
    quantity: number;
    name: string;
    slug: string;
    imageUrl: string;
    options: Record<string, string>;
    unitPriceCents: number;
    totalCents: number;
    stock: number;
    savedForLater: boolean;
  }[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  giftCardAppliedCents?: number;
  amountDueCents?: number;
};
export function Totals({ cart }: { cart: CartView }) {
  return (
    <>
      <div className="summary-row">
        <span>Subtotal</span>
        <span>{money(cart.subtotal)}</span>
      </div>
      <div className="summary-row">
        <span>Discount</span>
        <span>−{money(cart.discount)}</span>
      </div>
      <div className="summary-row">
        <span>Delivery</span>
        <span>
          {cart.shipping === 0 ? "Complimentary" : money(cart.shipping)}
        </span>
      </div>
      <div className="summary-row">
        <span>Estimated tax</span>
        <span>{money(cart.tax)}</span>
      </div>
      {(cart.giftCardAppliedCents ?? 0) > 0 && (
        <div className="summary-row">
          <span>Gift card</span>
          <span>−{money(cart.giftCardAppliedCents ?? 0)}</span>
        </div>
      )}
      <div className="summary-row total">
        <span>Total due</span>
        <span>{money(cart.amountDueCents ?? cart.total)}</span>
      </div>
    </>
  );
}
export function CartPage() {
  const [cart, setCart] = useState<CartView>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      setCart(await api<CartView>("/cart"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function change(id: string, q: number) {
    setBusy(true);
    try {
      await api(`/cart/items/${id}`, {
        method: q === 0 ? "DELETE" : "PATCH",
        body: q === 0 ? undefined : JSON.stringify({ quantity: q }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!cart)
    return (
      <div className="empty-state">
        {error ? (
          <>
            <h2>We couldn’t open your bag.</h2>
            <p>{error}</p>
            <button className="button" onClick={load}>
              Try again
            </button>
          </>
        ) : (
          <p>Opening your bag…</p>
        )}
      </div>
    );
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">READY FOR THE EVERYDAY</p>
        <h1>Your bag.</h1>
        <p>
          {cart.items.length} {cart.items.length === 1 ? "object" : "objects"}{" "}
          selected with intention.
        </p>
      </div>
      <div className="split-page">
        <div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {cart.items.length ? (
            cart.items.map((i) => (
              <article className="cart-line" key={i.id}>
                <Link href={`/products/${i.slug}`}>
                  <Image
                    src={i.imageUrl || "/products/object.svg"}
                    alt={i.name}
                    width={120}
                    height={150}
                  />
                </Link>
                <div>
                  <Link href={`/products/${i.slug}`}>
                    <h3>{i.name}</h3>
                  </Link>
                  <p>{Object.values(i.options || {}).join(" / ")}</p>
                  <div className="quantity">
                    <button
                      disabled={busy}
                      aria-label={`Decrease ${i.name}`}
                      onClick={() => change(i.id, Math.max(1, i.quantity - 1))}
                    >
                      −
                    </button>
                    <span>{i.quantity}</span>
                    <button
                      disabled={busy || i.quantity >= i.stock}
                      aria-label={`Increase ${i.name}`}
                      onClick={() => change(i.id, i.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <div className="inline-actions">
                    <button disabled={busy} onClick={() => change(i.id, 0)}>
                      Remove
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await api(`/cart/items/${i.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              savedForLater: !i.savedForLater,
                            }),
                          });
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {i.savedForLater ? "Move to bag" : "Save for later"}
                    </button>
                  </div>
                </div>
                <span className="price">{money(i.totalCents)}</span>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <h2>Room for something good.</h2>
              <p>Your bag is empty. Explore our independent edit.</p>
              <Link className="button" href="/shop">
                Find your everyday ↗
              </Link>
            </div>
          )}
          <Link className="text-link" href="/shop">
            ← Continue exploring
          </Link>
        </div>
        <aside className="panel summary">
          <h2>A considered total.</h2>
          <Totals cart={cart} />
          <form
            className="form-stack"
            style={{ marginTop: 25 }}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/cart/coupon", {
                  method: "POST",
                  body: JSON.stringify({
                    code: new FormData(e.currentTarget).get("code"),
                  }),
                });
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label className="field">
              Promotion code
              <input name="code" placeholder="e.g. WELCOME10" required />
            </label>
            <button className="button secondary">Apply code</button>
          </form>
          <form
            className="form-stack"
            style={{ marginTop: 20 }}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/cart/gift-card", {
                  method: "POST",
                  body: JSON.stringify({
                    code: new FormData(e.currentTarget).get("code"),
                  }),
                });
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label className="field">
              Gift card
              <input name="code" placeholder="Gift card code" required />
            </label>
            <button className="button secondary">Apply gift card</button>
          </form>
          {cart.items.length > 0 && (
            <Link className="button" href="/checkout">
              Continue to checkout ↗
            </Link>
          )}
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 20 }}>
            Secure mock checkout. No real money is collected.
          </p>
        </aside>
      </div>
    </>
  );
}

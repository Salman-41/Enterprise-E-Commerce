"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Order } from "@/lib/api";
import { CartView, Totals } from "./cart";
export function Checkout() {
  const router = useRouter();
  const [cart, setCart] = useState<CartView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string>("");
  useEffect(() => {
    key.current = crypto.randomUUID();
    void api("/catalog/events", {
      method: "POST",
      body: JSON.stringify({ type: "checkout_started" }),
    }).catch(() => {});
    api<CartView>("/cart")
      .then(setCart)
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const order = await api<Order>("/checkout", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: JSON.stringify({
          email: data.get("email"),
          address: {
            name: data.get("name"),
            line1: data.get("line1"),
            line2: data.get("line2") || "",
            city: data.get("city"),
            region: data.get("region") || "",
            postalCode: data.get("postalCode"),
            country: data.get("country"),
          },
          shippingMethod: data.get("shippingMethod"),
          paymentMethod: data.get("paymentMethod"),
        }),
      });
      router.push(`/orders/${order.id}?token=${order.trackingToken}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!cart)
    return (
      <div className="empty-state">
        <h2>{error || "Preparing your checkout…"}</h2>
      </div>
    );
  if (!cart.items.some((i) => !i.savedForLater))
    return (
      <div className="empty-state">
        <h2>Your bag is waiting.</h2>
        <Link className="button" href="/shop">
          Select an object ↗
        </Link>
      </div>
    );
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">ONE MORE CONSIDERED STEP</p>
        <h1>Make it yours.</h1>
        <p>
          Guest checkout, or{" "}
          <Link className="text-link" href="/account">
            sign in to your account
          </Link>
          .
        </p>
      </div>
      <div className="split-page">
        <form onSubmit={submit} className="form-stack">
          <h2 className="section-title">01 / Your details</h2>
          <label className="field">
            Email address
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <h2 className="section-title">02 / Where it’s going</h2>
          <div className="form-grid">
            <label className="field span-2">
              Full name
              <input name="name" autoComplete="name" required minLength={2} />
            </label>
            <label className="field span-2">
              Street address
              <input name="line1" autoComplete="address-line1" required />
            </label>
            <label className="field span-2">
              Apartment, suite (optional)
              <input name="line2" autoComplete="address-line2" />
            </label>
            <label className="field">
              City
              <input name="city" autoComplete="address-level2" required />
            </label>
            <label className="field">
              State / region
              <input name="region" autoComplete="address-level1" />
            </label>
            <label className="field">
              Postal code
              <input name="postalCode" autoComplete="postal-code" required />
            </label>
            <label className="field">
              Country
              <select name="country" autoComplete="country" defaultValue="US">
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="PK">Pakistan</option>
                <option value="CA">Canada</option>
                <option value="AU">Australia</option>
              </select>
            </label>
          </div>
          <h2 className="section-title">03 / Delivery & payment</h2>
          <label className="field">
            Delivery
            <select name="shippingMethod">
              <option value="standard">Standard · 3–5 working days</option>
              <option value="express">Express · 1–2 working days</option>
            </select>
          </label>
          <label className="field">
            Demo payment outcome
            <select name="paymentMethod">
              <option value="mock_success">Mock payment · succeeds</option>
              <option value="mock_fail">
                Mock payment · declined (test retry)
              </option>
            </select>
          </label>
          <p className="notice">
            This is a functional local demonstration. No card details or real
            payment are required.
          </p>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" required /> I agree to the{" "}
            <Link href="/terms" style={{ textDecoration: "underline" }}>
              terms
            </Link>{" "}
            and understand this is a demo order.
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Placing your order…" : "Place demo order"} ↗
          </button>
        </form>
        <aside className="panel summary">
          <h2>Your everyday, selected.</h2>
          {cart.items
            .filter((i) => !i.savedForLater)
            .map((i) => (
              <div className="summary-row" key={i.id}>
                <span>
                  {i.name} × {i.quantity}
                </span>
              </div>
            ))}
          <Totals cart={cart} />
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 20 }}>
            Final delivery and tax are recalculated securely by the server for
            the selected address and method.
          </p>
        </aside>
      </div>
    </>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
type OrderView = {
  id: string;
  orderNumber?: string;
  number?: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  createdAt: string;
  trackingToken: string;
  items: {
    id: string;
    name?: string;
    productName?: string;
    quantity: number;
    unitPriceCents: number;
  }[];
  history: { id: string; status: string; note?: string; createdAt: string }[];
};
export function OrderDetail({ id, token }: { id: string; token?: string }) {
  const [order, setOrder] = useState<OrderView>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    try {
      const found = id
        ? undefined
        : await api<{ id: string }>(`/orders/track/${token}`);
      setOrder(
        await api<OrderView>(
          token
            ? `/orders/${id || found?.id}?token=${token}`
            : `/account/orders/${id}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [id, token]);
  async function retry() {
    try {
      await api(
        `/orders/${id || order?.id}/pay${token ? `?token=${token}` : ""}`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ paymentMethod: "mock_success" }),
        },
      );
      await load();
      setMessage("Your payment is confirmed.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  if (!order)
    return (
      <div className="empty-state">
        <h2>{error || "Finding your order…"}</h2>
      </div>
    );
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">
          {order.paymentStatus === "failed"
            ? "LET’S TRY THAT AGAIN"
            : "THANK YOU FOR CHOOSING WELL"}
        </p>
        <h1>
          {order.paymentStatus === "failed"
            ? "A small pause."
            : "Good things are on their way."}
        </h1>
        <p>
          Order {order.orderNumber || order.number || order.id.slice(0, 8)} ·{" "}
          {new Date(order.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="split-page">
        <div>
          {order.paymentStatus === "failed" && (
            <div className="notice error">
              <p>
                Your demo payment was declined. Your order is saved; you can try
                another mock payment.
              </p>
              <button className="button" onClick={retry}>
                Retry payment ↗
              </button>
            </div>
          )}
          <p role="status">{message}</p>
          <h2 className="section-title">Your order timeline</h2>
          <ol className="timeline">
            {order.history?.map((h) => (
              <li key={h.id}>
                <strong>{h.status.replaceAll("_", " ")}</strong>
                <time>{new Date(h.createdAt).toLocaleString()}</time>
                {h.note && <span>{h.note}</span>}
              </li>
            ))}
          </ol>
          <h2 className="section-title">Selected objects</h2>
          {order.items?.map((i) => (
            <div className="summary-row" key={i.id}>
              <span>
                {i.name || i.productName} × {i.quantity}
              </span>
              <span>{money(i.unitPriceCents * i.quantity)}</span>
            </div>
          ))}
          {!token &&
            ["paid", "fulfilled", "completed"].includes(order.status) && (
              <ReturnForm id={id} items={order.items} />
            )}
          <Link className="text-link" href="/shop">
            Continue exploring ↗
          </Link>
        </div>
        <aside className="panel summary">
          <h2>The details.</h2>
          <div className="summary-row">
            <span>Order status</span>
            <span className="badge">{order.status}</span>
          </div>
          <div className="summary-row">
            <span>Payment</span>
            <span>{order.paymentStatus}</span>
          </div>
          <div className="summary-row total">
            <span>Total</span>
            <span>{money(order.totalCents)}</span>
          </div>
          <Link
            className="text-link"
            href={`/track?token=${order.trackingToken}`}
          >
            Track this order ↗
          </Link>
          {!token && (
            <button
              className="button secondary"
              onClick={() => window.print()}
              style={{ marginTop: 20 }}
            >
              Print receipt
            </button>
          )}
        </aside>
      </div>
    </>
  );
}
function ReturnForm({ id, items }: { id: string; items: OrderView["items"] }) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="form-stack panel"
      style={{ marginTop: 30 }}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/account/orders/${id}/return`, {
            method: "POST",
            body: JSON.stringify({
              reason: new FormData(e.currentTarget).get("reason"),
              resolution: "refund",
              items: items.map((i) => ({
                orderItemId: i.id,
                quantity: i.quantity,
              })),
            }),
          });
          setMessage("Your return request has been received.");
        } catch (e) {
          setMessage((e as Error).message);
        }
      }}
    >
      <h3>Request a return</h3>
      <label className="field">
        Reason
        <textarea name="reason" minLength={10} required />
      </label>
      <button className="button secondary">Submit request</button>
      <p role="status">{message}</p>
    </form>
  );
}
export function Track() {
  const [token, setToken] = useState("");
  const [value, setValue] = useState("");
  useEffect(() => {
    setToken(new URLSearchParams(location.search).get("token") || "");
  }, []);
  if (token) return <OrderDetail id="" token={token} />;
  return (
    <div className="content-page">
      <p className="eyebrow">FOLLOW THE EVERYDAY</p>
      <h1>Track your order.</h1>
      <p>Use the private tracking token supplied in your confirmation email.</p>
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setToken(value);
        }}
      >
        <input
          aria-label="Tracking token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
        <button className="button">Find order ↗</button>
      </form>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money, Product } from "@/lib/api";
import { ProductCard } from "./product-card";
type User = { id: string; name: string; email: string; role: string };
type Order = {
  id: string;
  number?: string;
  orderNumber?: string;
  createdAt: string;
  status: string;
  totalCents: number;
};
type Address = {
  id: string;
  name: string;
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};
export function Account() {
  const [user, setUser] = useState<User | null>();
  const [tab, setTab] = useState("orders");
  const [error, setError] = useState("");
  async function refresh() {
    try {
      setUser((await api<{ user: User | null }>("/auth/me")).user);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  if (user === undefined)
    return (
      <div className="empty-state">{error || "Opening your account…"}</div>
    );
  if (user === null) return <Auth onSuccess={refresh} />;
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">YOUR FIELDWORK</p>
        <h1>Hello, {user.name.split(" ")[0]}.</h1>
        <p>A place for your orders, saved objects and everyday details.</p>
      </div>
      <div className="account-layout">
        <nav className="account-nav" aria-label="Account sections">
          {[
            "orders",
            "addresses",
            "wishlist",
            "profile",
            "security",
            "rewards",
            "notifications",
          ].map((t) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          {user.role.toLowerCase() !== "customer" && (
            <Link href="/admin">Operations ↗</Link>
          )}
          <button
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              setUser(null);
            }}
          >
            Sign out
          </button>
        </nav>
        <div>
          {tab === "orders" && <Orders />}
          {tab === "addresses" && <Addresses />}
          {tab === "wishlist" && <Wishlist />}
          {tab === "profile" && (
            <Profile user={user} onSuccess={refresh} />
          )}{" "}
          {tab === "security" && <Security />}
          {tab === "rewards" && <Rewards />}
          {tab === "notifications" && <Notifications />}
        </div>
      </div>
    </>
  );
}
function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries());
    try {
      await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (mode === "login" || mode === "register") onSuccess();
      else
        setMessage(
          "If the address belongs to an account, you’ll receive instructions by email.",
        );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <p className="eyebrow">WELCOME TO FIELDWORK</p>
      <h1>
        {mode === "register"
          ? "Make yourself at home."
          : mode === "forgot-password"
            ? "Let’s get you back in."
            : "Good to see you."}
      </h1>
      <div className="auth-tabs">
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
        <button
          className={mode === "register" ? "active" : ""}
          onClick={() => setMode("register")}
        >
          Create an account
        </button>
      </div>
      <form className="form-stack" onSubmit={submit}>
        {mode === "register" && (
          <label className="field">
            Name
            <input name="name" autoComplete="name" required minLength={2} />
          </label>
        )}
        <label className="field">
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        {mode !== "forgot-password" && (
          <label className="field">
            Password
            <input
              name="password"
              type="password"
              minLength={mode === "register" ? 12 : 1}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
            />
          </label>
        )}
        <button className="button" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "register"
              ? "Create account ↗"
              : mode === "forgot-password"
                ? "Send reset instructions ↗"
                : "Sign in ↗"}
        </button>
        <p className="message" role="status">
          {message}
        </p>
      </form>
      <button
        className="text-link"
        style={{ background: "transparent", border: 0 }}
        onClick={() => setMode("forgot-password")}
      >
        Forgot your password?
      </button>
      <p className="notice" style={{ marginTop: 30 }}>
        Demo customer: customer@example.com
        <br />
        Password: DemoCustomer!2026
      </p>
    </div>
  );
}
function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("Loading your orders…");
  useEffect(() => {
    api<{ items: Order[] } | Order[]>("/account/orders")
      .then((v) => {
        setOrders(Array.isArray(v) ? v : v.items);
        setMessage("");
      })
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <>
      <h2 className="section-title">Your orders</h2>
      {message && <p role="status">{message}</p>}
      {orders.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Placed</th>
              <th>Status</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.orderNumber || o.number || o.id.slice(0, 8)}</td>
                <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                <td>
                  <span className="badge">{o.status}</span>
                </td>
                <td>{money(o.totalCents)}</td>
                <td>
                  <Link href={`/orders/${o.id}`}>View ↗</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !message && (
          <p>
            You haven’t placed an order yet.{" "}
            <Link href="/shop">Explore the edit ↗</Link>
          </p>
        )
      )}
    </>
  );
}
function Addresses() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [message, setMessage] = useState("");
  async function load() {
    try {
      const v = await api<Address[] | { items: Address[] }>(
        "/account/addresses",
      );
      setAddresses(Array.isArray(v) ? v : v.items);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <h2 className="section-title">Your addresses</h2>
      <div className="form-grid">
        {addresses.map((a) => (
          <div className="panel" key={a.id}>
            <h3>{a.name}</h3>
            <p>
              {a.line1}
              <br />
              {a.city} {a.postalCode}
              <br />
              {a.country}
            </p>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await api(`/account/addresses/${a.id}`, { method: "DELETE" });
                  await load();
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              Remove address
            </button>
          </div>
        ))}
      </div>
      <form
        className="form-stack panel"
        style={{ marginTop: 25, maxWidth: 650 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          try {
            await api("/account/addresses", {
              method: "POST",
              body: JSON.stringify(
                Object.fromEntries(new FormData(form).entries()),
              ),
            });
            form.reset();
            await load();
            setMessage("Address saved.");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <h3>Add an address</h3>
        <div className="form-grid">
          {["name", "line1", "city", "region", "postalCode", "country"].map(
            (n) => (
              <label className="field" key={n}>
                {
                  (
                    {
                      name: "Full name",
                      line1: "Street address",
                      city: "City",
                      region: "Region",
                      postalCode: "Postal code",
                      country: "Country code",
                    } as Record<string, string>
                  )[n]
                }
                <input
                  name={n}
                  required={n !== "region"}
                  defaultValue={n === "country" ? "US" : undefined}
                />
              </label>
            ),
          )}
        </div>
        <button className="button">Save address ↗</button>
        <p role="status">{message}</p>
      </form>
    </>
  );
}
function Wishlist() {
  const [items, setItems] = useState<Product[]>([]);
  const [message, setMessage] = useState("Loading saved objects…");
  useEffect(() => {
    api<{ items: Product[] } | Product[]>("/account/wishlist")
      .then((v) => {
        setItems(Array.isArray(v) ? v : v.items);
        setMessage("");
      })
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <>
      <h2 className="section-title">Objects to come back to.</h2>
      {message && <p>{message}</p>}
      <div className="product-grid">
        {items.map((p) => (
          <ProductCard product={p} key={p.id} />
        ))}
      </div>
      {!message && !items.length && (
        <p>Save an object from its product page to keep it here.</p>
      )}
    </>
  );
}
function Profile({ user, onSuccess }: { user: User; onSuccess: () => void }) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="form-stack"
      style={{ maxWidth: 550 }}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/account/profile", {
            method: "PATCH",
            body: JSON.stringify({
              name: new FormData(e.currentTarget).get("name"),
            }),
          });
          setMessage("Your details are updated.");
          onSuccess();
        } catch (e) {
          setMessage((e as Error).message);
        }
      }}
    >
      <h2 className="section-title">Your details</h2>
      <label className="field">
        Name
        <input name="name" defaultValue={user.name} required minLength={2} />
      </label>
      <label className="field">
        Email
        <input value={user.email} readOnly />
      </label>
      <button className="button">Save details ↗</button>
      <p role="status">{message}</p>
    </form>
  );
}
function Security() {
  const [message, setMessage] = useState("");
  return (
    <div className="form-stack" style={{ maxWidth: 550 }}>
      <h2 className="section-title">Security & sessions</h2>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/auth/change-password", {
              method: "POST",
              body: JSON.stringify(
                Object.fromEntries(new FormData(e.currentTarget).entries()),
              ),
            });
            setMessage("Password updated.");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <label className="field">
          Current password
          <input name="currentPassword" type="password" required />
        </label>
        <label className="field">
          New password
          <input name="newPassword" type="password" minLength={12} required />
        </label>
        <button className="button">Update password</button>
      </form>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            await api("/auth/logout-all", { method: "POST" });
            location.reload();
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Sign out on all devices
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
function Rewards() {
  const [data, setData] = useState<{
    loyaltyPoints: number;
    giftCards: { code: string; balanceCents: number }[];
  }>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<{
      loyaltyPoints: number;
      giftCards: { code: string; balanceCents: number }[];
    }>("/account/rewards")
      .then(setData)
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <>
      <h2 className="section-title">A little thank you.</h2>
      {message && <p>{message}</p>}
      {data && (
        <>
          <p>You have {data.loyaltyPoints} loyalty points.</p>
          <h3>Gift cards</h3>
          {data.giftCards.map((g) => (
            <div className="summary-row" key={g.code}>
              <span>{g.code}</span>
              <span>{money(g.balanceCents)}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
function Notifications() {
  const [message, setMessage] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/account/preferences", {
            method: "PATCH",
            body: JSON.stringify({
              newsletter: new FormData(e.currentTarget).has("newsletter"),
            }),
          });
          setMessage("Preferences saved.");
        } catch (e) {
          setMessage((e as Error).message);
        }
      }}
    >
      <h2 className="section-title">Only the good things.</h2>
      <label>
        <input type="checkbox" name="newsletter" /> Email me new arrivals and
        stories.
      </label>
      <p>Order and security emails are sent when needed.</p>
      <button className="button">Save preferences</button>
      <p role="status">{message}</p>
    </form>
  );
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  csv,
  labels,
  present,
  sections,
  value,
  type Row,
  type Page,
  type Section,
} from "./contracts";
import { Editor } from "./editor";
import { Inspector } from "./inspector";
import { InventoryImport } from "./import";
import { request } from "./client";
const sortOptions: Partial<Record<Section, string[]>> = {
  products: ["createdAt", "name", "status"],
  inventory: ["updatedAt", "onHand"],
  orders: ["createdAt", "status"],
  customers: ["createdAt", "name", "status"],
  promotions: ["createdAt", "name"],
  reviews: ["createdAt", "status"],
  content: ["updatedAt", "title"],
};
const searchable = [
  "products",
  "inventory",
  "orders",
  "customers",
  "promotions",
  "reviews",
  "content",
];
const statusFilter = ["products", "orders", "customers", "reviews"];
const columns: Partial<Record<Section, string[]>> = {
  products: ["name", "status", "priceCents", "brand", "variants", "updatedAt"],
  inventory: ["variant", "warehouse", "onHand", "reserved", "version"],
  orders: ["number", "email", "status", "totalCents", "createdAt"],
  returns: ["id", "orderId", "reason", "status", "createdAt"],
  customers: ["name", "email", "role", "createdAt"],
  promotions: ["name", "kind", "value", "active", "coupons"],
  giftcards: ["code", "initialCents", "balanceCents", "active", "expiresAt"],
  loyalty: ["user", "points", "ledger", "updatedAt"],
  reviews: ["rating", "title", "status", "verifiedPurchase", "createdAt"],
  content: ["slug", "title", "published", "updatedAt"],
  audit: ["action", "entity", "actorId", "createdAt"],
  jobs: ["type", "status", "attempts", "error", "createdAt"],
  webhooks: ["provider", "eventId", "status", "attempts", "createdAt"],
  roles: ["name", "permissions"],
  featureflags: ["key", "enabled", "description"],
};
const readPermissions: Record<Section, string> = {
  dashboard: "analytics.read",
  products: "catalog.read",
  inventory: "inventory.manage",
  orders: "orders.read",
  returns: "orders.read",
  customers: "customers.read",
  promotions: "promotions.manage",
  giftcards: "promotions.manage",
  loyalty: "customers.read",
  reviews: "reviews.manage",
  content: "content.manage",
  audit: "system.admin",
  jobs: "system.admin",
  webhooks: "system.admin",
  roles: "system.admin",
  featureflags: "system.admin",
  health: "system.admin",
};
const writePermissions: Partial<Record<Section, string>> = {
  products: "catalog.write",
  inventory: "inventory.manage",
  orders: "orders.manage",
  returns: "orders.manage",
  promotions: "promotions.manage",
  reviews: "reviews.manage",
  content: "content.manage",
  featureflags: "system.admin",
  giftcards: "promotions.manage",
  jobs: "system.admin",
};
const writable = [
  "products",
  "inventory",
  "orders",
  "returns",
  "promotions",
  "reviews",
  "content",
  "featureflags",
];
export function AdminConsole({ section }: { section: Section }) {
  const [data, setData] = useState<Row | Page | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState(sortOptions[section]?.[0] ?? "createdAt"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Row | null>(null),
    [importing, setImporting] = useState(false),
    [create, setCreate] = useState(false),
    [inspection, setInspection] = useState<Row | null>(null),
    [notice, setNotice] = useState(""),
    [user, setUser] = useState<Row | null>(null),
    [hidden, setHidden] = useState<string[]>([]);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setBusy(true);
    setData(null);
    setError("");
    try {
      const result = await request<Row | Page>(
        `/admin/${section}?${new URLSearchParams({ page: String(page), limit: "20", q: query, ...(status ? { status } : {}), sort })}`,
      );
      if (id === sequence.current) setData(result);
    } catch (err) {
      if (id === sequence.current) setError((err as Error).message);
    } finally {
      if (id === sequence.current) setBusy(false);
    }
  }, [section, page, query, status, sort]);
  useEffect(() => {
    setPage(1);
    setSearch("");
    setQuery("");
    setStatus("");
    setSort(sortOptions[section]?.[0] ?? "createdAt");
    setHidden([]);
    setSelected(null);
    setInspection(null);
    setCreate(false);
    setNotice("");
  }, [section]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    request<{ user: Row | null }>("/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => {});
  }, []);
  const permissions = Array.isArray(user?.permissions)
    ? (user.permissions as string[])
    : [];
  const canWrite =
    permissions.includes("*") ||
    permissions.includes(writePermissions[section] ?? "system.admin");
  const isPage = (input: Row | Page | null): input is Page =>
    !!input && Array.isArray(input.items);
  const rows = isPage(data) ? data.items : [];
  const keys = (
    columns[section] ??
    Object.keys(rows[0] ?? {})
      .filter((k) => !["id", "passwordHash"].includes(k))
      .slice(0, 6)
  ).filter((k) => !hidden.includes(k));
  async function exportRows() {
    setNotice("");
    try {
      const exported = await request<Page>(
        `/admin/${section}?${new URLSearchParams({ page: "1", limit: "100", q: query, ...(status ? { status } : {}), sort })}`,
      );
      const url = URL.createObjectURL(
        new Blob([csv(exported.items)], { type: "text/csv;charset=utf-8;" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `fieldwork-${section}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(
        `Exported ${exported.items.length} rows. Export is limited to the first 100 matching records. Narrow the filters for a complete batch.`,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-brand">
          FIELDWORK<span>COMMERCE OPERATIONS</span>
        </Link>
        <nav aria-label="Operations">
          {sections
            .filter(
              (item) =>
                permissions.includes("*") ||
                permissions.includes(readPermissions[item]) ||
                item === section,
            )
            .map((item) => (
              <Link
                key={item}
                href={item === "dashboard" ? "/admin" : `/admin/${item}`}
                aria-current={section === item ? "page" : undefined}
              >
                {labels[item]}
              </Link>
            ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <span>
            {user ? present(user.name ?? user.email) : "Protected workspace"}
          </span>
          <Link href="/account">Account & sign in ↗</Link>
          <Link href="/">Open storefront ↗</Link>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-top">
          <span>WORKSPACE / {labels[section].toUpperCase()}</span>
          <button onClick={() => void load()} disabled={busy}>
            Refresh ↻
          </button>
        </header>
        <div className="admin-heading">
          <div>
            <p className="admin-eyebrow">FIELDWORK OPERATIONS</p>
            <h1>{labels[section]}</h1>
            <p>
              {section === "dashboard"
                ? "A clear view of your store, from first order to final delivery."
                : "Manage the details. Every change is checked by the API and recorded where appropriate."}
            </p>
          </div>
          {canWrite &&
            ["products", "promotions", "giftcards"].includes(section) && (
              <button className="admin-primary" onClick={() => setCreate(true)}>
                + Create{" "}
                {section === "products"
                  ? "product"
                  : section === "giftcards"
                    ? "gift card"
                    : "promotion"}
              </button>
            )}
        </div>
        {notice && (
          <div role="status" className="admin-notice">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="admin-error">
            <strong>Unable to complete the request</strong>
            <p>{error}</p>
            <Link href="/account">Sign in or manage your account ↗</Link>
            <button onClick={() => void load()}>Try again</button>
          </div>
        )}
        {busy ? (
          <div className="admin-loading" role="status">
            Loading store operations…
          </div>
        ) : data && section === "dashboard" ? (
          <Dashboard data={data as Row} />
        ) : data && section === "health" ? (
          <Health data={data as Row} />
        ) : (
          <>
            <form
              className="admin-toolbar"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setQuery(search);
              }}
            >
              {searchable.includes(section) && (
                <label>
                  Search
                  <input
                    placeholder={`Search ${labels[section].toLowerCase()}`}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              )}
              {statusFilter.includes(section) && (
                <label>
                  Status
                  <input
                    placeholder="Any status"
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              )}
              {sortOptions[section] && (
                <label>
                  Sort
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    {sortOptions[section]?.map((option) => (
                      <option key={option} value={option}>
                        {option === "createdAt"
                          ? "Newest first"
                          : option === "updatedAt"
                            ? "Recently updated"
                            : option === "onHand"
                              ? "Stock level"
                              : option.charAt(0).toUpperCase() +
                                option.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {searchable.includes(section) && (
                <button type="submit">Apply</button>
              )}
              <button type="button" onClick={() => void exportRows()}>
                Export CSV ↓
              </button>
              {section === "inventory" && canWrite && (
                <button type="button" onClick={() => setImporting(true)}>
                  Import adjustments ↑
                </button>
              )}
              <details>
                <summary>Columns</summary>
                {(columns[section] ?? keys).map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={!hidden.includes(key)}
                      onChange={() =>
                        setHidden(
                          hidden.includes(key)
                            ? hidden.filter((k) => k !== key)
                            : [...hidden, key],
                        )
                      }
                    />
                    {key}
                  </label>
                ))}
              </details>
            </form>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    {keys.map((key) => (
                      <th key={key}>{key.replace(/([A-Z])/g, " $1")}</th>
                    ))}
                    {<th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={value(row, "id") || index}>
                      {keys.map((key) => (
                        <td key={key}>
                          {key === "status" ? (
                            <span
                              className={`admin-status ${value(row, key).toLowerCase()}`}
                            >
                              {present(row[key], key)}
                            </span>
                          ) : /Cents$/.test(key) ? (
                            new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                            }).format(Number(row[key] ?? 0) / 100)
                          ) : (
                            present(row[key], key)
                          )}
                        </td>
                      ))}
                      {
                        <td>
                          {!canWrite || !writable.includes(section) ? (
                            <>
                              <button onClick={() => setInspection(row)}>
                                Inspect ↗
                              </button>
                              {section === "jobs" &&
                                canWrite &&
                                value(row, "status") === "failed" && (
                                  <button
                                    onClick={async () => {
                                      if (
                                        !window.confirm(
                                          "Retry this failed job?",
                                        )
                                      )
                                        return;
                                      try {
                                        await request(
                                          `/admin/jobs/${value(row, "id")}/retry`,
                                          { method: "POST" },
                                        );
                                        setNotice("Job queued for retry.");
                                        void load();
                                      } catch (err) {
                                        setError((err as Error).message);
                                      }
                                    }}
                                  >
                                    Retry job
                                  </button>
                                )}
                            </>
                          ) : (
                            <button
                              aria-label={`Manage ${value(row, "title") || value(row, "number") || value(row, "id")}`}
                              onClick={() => setSelected(row)}
                            >
                              Manage ↗
                            </button>
                          )}
                        </td>
                      }
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <div className="admin-empty">
                  <h2>No matching records</h2>
                  <p>Try another search or remove your filters.</p>
                </div>
              )}
            </div>
            <div className="admin-pagination">
              <span>
                {isPage(data) ? data.total : 0} records · Page {page}
              </span>
              <div>
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  ← Previous
                </button>
                <button
                  disabled={!isPage(data) || page * 20 >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
        {importing && (
          <InventoryImport
            onClose={() => setImporting(false)}
            onComplete={() => void load()}
          />
        )}{" "}
        {inspection && (
          <Inspector
            row={inspection}
            section={section}
            canAssignRoles={
              permissions.includes("*") || permissions.includes("system.admin")
            }
            onClose={() => setInspection(null)}
          />
        )}{" "}
        {(selected || create) && (
          <Editor
            section={section}
            row={selected}
            onClose={() => {
              setSelected(null);
              setCreate(false);
            }}
            onSaved={(message) => {
              setSelected(null);
              setCreate(false);
              setNotice(message);
              void load();
            }}
          />
        )}
      </main>
    </div>
  );
}
function Dashboard({ data }: { data: Row }) {
  const metrics = Object.entries(data).filter(([, v]) => typeof v === "number");
  const lists = Object.entries(data).filter(
    ([key, v]) => Array.isArray(v) && key !== "trend",
  );
  return (
    <>
      {Array.isArray(data.trend) && <RevenueChart rows={data.trend as Row[]} />}
      <div className="admin-metrics">
        {metrics
          .filter(([key]) => key !== "uptime")
          .map(([key, val]) => (
            <article key={key}>
              <span>{key.replace(/([A-Z])/g, " $1")}</span>
              <strong>
                {/revenue|refund|averageOrder|aov|value/i.test(key)
                  ? new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(Number(val) / 100)
                  : Number(val).toLocaleString()}
              </strong>
              <small>Calculated from store records</small>
            </article>
          ))}
      </div>
      <div className="admin-dashboard-lists">
        {lists.map(([key, entries]) => (
          <section className="admin-card" key={key}>
            <h2>{key.replace(/([A-Z])/g, " $1")}</h2>
            {(entries as Row[]).length ? (
              (entries as Row[])
                .slice(0, 10)
                .map((raw) =>
                  key === "lowStock"
                    ? {
                        sku: (raw.variant as Row)?.sku,
                        warehouse: (raw.warehouse as Row)?.name,
                        available: Number(raw.onHand) - Number(raw.reserved),
                        threshold: raw.lowStockThreshold,
                      }
                    : key === "recentOrders"
                      ? {
                          number: raw.number,
                          status: raw.status,
                          email: raw.email,
                          totalCents: raw.totalCents,
                        }
                      : raw,
                )
                .map((row, i) => (
                  <div className="admin-summary-row" key={i}>
                    {Object.entries(row)
                      .filter(([k, v]) => k !== "id" && typeof v !== "object")
                      .slice(0, 4)
                      .map(([k, v]) => (
                        <span key={k}>
                          <small>{k}</small>
                          {/Cents$/.test(k)
                            ? new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: "USD",
                              }).format(Number(v) / 100)
                            : present(v, k)}
                        </span>
                      ))}
                  </div>
                ))
            ) : (
              <p>No records in this segment.</p>
            )}
          </section>
        ))}
      </div>
      {!metrics.length && !lists.length && <Health data={data} />}
    </>
  );
}
function Health({ data }: { data: Row }) {
  return (
    <section className="admin-card">
      <h2>Service report</h2>
      <dl className="admin-health">
        {Object.entries(data).map(([key, val]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              {typeof val === "object" ? JSON.stringify(val) : present(val)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RevenueChart({ rows }: { rows: Row[] }) {
  if (!rows.length)
    return (
      <section className="admin-card">
        <h2>Revenue over time</h2>
        <p>No captured payments in this period.</p>
      </section>
    );
  const values = rows.map((row) => Number(row.revenue ?? 0));
  const max = Math.max(...values, 1);
  const points = values
    .map(
      (val, index) =>
        `${40 + (index / Math.max(values.length - 1, 1)) * 840},${165 - (val / max) * 125}`,
    )
    .join(" ");
  return (
    <section className="admin-card admin-chart">
      <header>
        <h2>Revenue over time</h2>
        <span>Monthly · captured orders</span>
      </header>
      <svg
        viewBox="0 0 920 215"
        role="img"
        aria-label="Monthly captured-order revenue"
      >
        <title>Monthly revenue from captured order records</title>
        <line x1="40" x2="880" y1="165" y2="165" stroke="#d5d9cb" />
        <polyline
          points={points}
          fill="none"
          stroke="#9b583d"
          strokeWidth="2.5"
        />
        {rows.map((row, index) => (
          <g key={String(row.date)}>
            <circle
              cx={40 + (index / Math.max(values.length - 1, 1)) * 840}
              cy={165 - (values[index] / max) * 125}
              r="4"
              fill="#9b583d"
            >
              <title>
                {String(row.date)}: ${(values[index] / 100).toFixed(2)}
              </title>
            </circle>
            {(index === 0 || index === rows.length - 1 || index % 3 === 0) && (
              <text
                x={40 + (index / Math.max(values.length - 1, 1)) * 840}
                y="193"
                textAnchor="middle"
                fontSize="11"
                fill="#808874"
              >
                {String(row.date)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </section>
  );
}

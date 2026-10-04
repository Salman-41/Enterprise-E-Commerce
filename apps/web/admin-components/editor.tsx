"use client";
import { useEffect, useRef, useState } from "react";
import { type Row, type Section, value } from "./contracts";
import { request } from "./client";
const localDate = (input: string | number | Date) => {
  const date = new Date(input);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
type Props = {
  section: Section;
  row: Row | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};
export function Editor({ section, row, onClose, onSaved }: Props) {
  const refundRequest = useRef<{ body: string; key: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [action, setAction] = useState(
      section === "orders"
        ? "fulfill"
        : section === "returns"
          ? "approve"
          : "save",
    ),
    [dirty, setDirty] = useState(false),
    [brands, setBrands] = useState<Row[]>([]),
    [categories, setCategories] = useState<Row[]>([]);
  useEffect(() => {
    dialog.current?.showModal();
    if (section === "products") {
      request<{ items: Row[] }>("/catalog/brands")
        .then((r) => setBrands(r.items))
        .catch(() => {});
      request<{ items: Row[] }>("/catalog/categories")
        .then((r) => setCategories(r.items))
        .catch(() => {});
    }
  }, [section]);
  function close() {
    if (!dirty || window.confirm("Discard unsaved changes?")) onClose();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const fields = new FormData(event.currentTarget);
    const read = (key: string) => String(fields.get(key) ?? "");
    const id = row ? value(row, "id") : "";
    let path = `/admin/${section}${id ? `/${id}` : ""}`,
      method = row ? "PATCH" : "POST",
      body: Record<string, unknown> = {};
    if (section === "products") {
      body = {
        name: read("name"),
        slug: read("slug"),
        description: read("description"),
        status: read("status"),
        priceCents: Number(read("priceCents")),
        brandId: read("brandId"),
        imageUrl: read("imageUrl"),
        version: row ? Number(read("version")) : undefined,
      };
      if (!row)
        body.variants = [
          {
            sku: read("sku"),
            name: read("variantName"),
            priceCents: Number(read("priceCents")),
          },
        ];
      if (read("categoryId")) body.categoryIds = [read("categoryId")];
    }
    if (section === "inventory") {
      path += "/adjust";
      method = "POST";
      body = {
        delta: Number(read("delta")),
        reason: read("reason"),
        version: Number(read("version")),
      };
    }
    if (section === "orders") {
      path += `/${action}`;
      method = "POST";
      body =
        action === "fulfill"
          ? {
              carrier: read("carrier"),
              trackingNumber: read("trackingNumber"),
              items:
                row && Array.isArray(row.items)
                  ? (row.items as Row[])
                      .map((item) => ({
                        orderItemId: value(item, "id"),
                        quantity: Number(read(`fulfill-${value(item, "id")}`)),
                      }))
                      .filter((item) => item.quantity > 0)
                  : undefined,
            }
          : action === "refund"
            ? { amount: Number(read("amount")), reason: read("reason") }
            : { reason: read("reason") };
    }
    if (section === "returns") {
      path += "/action";
      method = "POST";
      body = { action, restock: fields.get("restock") === "on" };
    }
    if (section === "promotions") {
      body = {
        name: read("name"),
        code: row ? undefined : read("code") || undefined,
        kind: read("kind"),
        value: Number(read("value")),
        minimumSpendCents: Number(read("minimumSpendCents")),
        usageLimit: read("usageLimit") ? Number(read("usageLimit")) : null,
        perCustomerLimit: Number(read("perCustomerLimit")),
        active: fields.get("active") === "on",
        startsAt: new Date(read("startsAt")).toISOString(),
        endsAt: read("endsAt") ? new Date(read("endsAt")).toISOString() : null,
      };
    }
    if (section === "giftcards")
      body = {
        code: read("code"),
        initialCents: Number(read("initialCents")),
        expiresAt: read("expiresAt")
          ? new Date(read("expiresAt")).toISOString()
          : undefined,
      };
    if (section === "reviews") body = { status: read("status") };
    if (section === "content")
      body = {
        title: read("title"),
        body: read("body"),
        published: fields.get("published") === "on",
      };
    if (section === "featureflags")
      body = { enabled: fields.get("enabled") === "on" };
    const financial =
      section === "giftcards" ||
      section === "inventory" ||
      section === "orders" ||
      section === "returns";
    if (
      financial &&
      !window.confirm(
        `Confirm ${action === "save" ? (section === "giftcards" ? "gift card issuance" : "inventory adjustment") : action}? This changes operational or financial records.`,
      )
    )
      return;
    const serialized = JSON.stringify(body);
    if (action === "refund" && refundRequest.current?.body !== serialized)
      refundRequest.current = { body: serialized, key: crypto.randomUUID() };
    setSaving(true);
    try {
      await request(path, {
        method,
        body: serialized,
        headers:
          action === "refund"
            ? { "Idempotency-Key": refundRequest.current!.key }
            : undefined,
      });
      onSaved("Change saved. Store records have been refreshed.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const field = (
    name: string,
    label: string,
    type = "text",
    defaultValue?: string | number,
    required = true,
  ) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? (row ? value(row, name) : "")}
        min={
          name === "initialCents"
            ? 100
            : name === "priceCents"
              ? 1
              : type === "number" && name !== "delta"
                ? 0
                : undefined
        }
        step={type === "number" ? 1 : undefined}
      />
    </label>
  );
  return (
    <dialog
      ref={dialog}
      className="admin-dialog"
      aria-labelledby="admin-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="admin-dialog-heading">
        <div>
          <p className="admin-eyebrow">{section.toUpperCase()}</p>
          <h2 id="admin-editor-title">
            {row ? "Manage record" : "Create record"}
          </h2>
        </div>
        <button aria-label="Close editor" onClick={close}>
          ×
        </button>
      </div>
      {row && <p className="admin-record-id">Record {value(row, "id")}</p>}
      <form onSubmit={submit} onChange={() => setDirty(true)}>
        {error && (
          <div role="alert" className="admin-error">
            {error}
          </div>
        )}
        {section === "products" && (
          <>
            {field("name", "Product title")}
            {field("slug", "URL slug")}
            <label>
              Description
              <textarea
                name="description"
                rows={4}
                defaultValue={row ? value(row, "description") : ""}
              />
            </label>
            <label>
              Publication
              <select
                name="status"
                defaultValue={row ? value(row, "status") : "draft"}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            {field(
              "priceCents",
              "Price in cents",
              "number",
              row ? value(row, "priceCents") : 0,
            )}
            <label>
              Brand
              <select
                name="brandId"
                key={brands.length}
                required
                defaultValue={row ? value(row, "brandId") : ""}
              >
                <option value="">Select brand</option>
                {brands.map((brand) => (
                  <option key={value(brand, "id")} value={value(brand, "id")}>
                    {value(brand, "name")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select name="categoryId" defaultValue="">
                <option value="">Keep existing categories</option>
                {categories.map((category) => (
                  <option
                    key={value(category, "id")}
                    value={value(category, "id")}
                  >
                    {value(category, "name")}
                  </option>
                ))}
              </select>
            </label>
            {field(
              "imageUrl",
              "Product image URL",
              "text",
              row ? value(row, "imageUrl") : "/products/object.svg",
            )}
            {!row && (
              <>
                {field("sku", "Initial variant SKU")}
                {field(
                  "variantName",
                  "Initial variant name",
                  "text",
                  "Default",
                )}
              </>
            )}
            <input
              name="version"
              type="hidden"
              value={row ? value(row, "version") : 0}
            />
            <p className="admin-help">
              Money uses integer cents. Existing variants keep their separate
              prices. Version checks prevent silent overwrites.
            </p>
          </>
        )}
        {section === "inventory" && (
          <>
            {field(
              "delta",
              "Adjustment quantity (positive or negative)",
              "number",
            )}
            {field("reason", "Reason")}
            <input
              type="hidden"
              name="version"
              value={row ? value(row, "version") : 0}
            />
            <p className="admin-help">
              This is a ledger adjustment. Reserved stock is protected by the
              server. Current version: {row ? value(row, "version") : "—"}.
            </p>
          </>
        )}
        {section === "orders" && (
          <>
            <label>
              Action
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                <option value="fulfill">Create shipment</option>
                <option value="refund">Issue refund</option>
                <option value="cancel">Cancel order</option>
              </select>
            </label>
            {action === "fulfill" ? (
              <>
                {field("carrier", "Carrier")}
                {field("trackingNumber", "Tracking number")}
                {row &&
                  Array.isArray(row.items) &&
                  (row.items as Row[]).map((item) => (
                    <div key={value(item, "id")}>
                      {field(
                        `fulfill-${value(item, "id")}`,
                        `Ship ${value(item, "name") || value(item, "productName")} (ordered ${value(item, "quantity")})`,
                        "number",
                        Math.max(
                          0,
                          Number(item.quantity) -
                            Number(item.fulfilledQuantity ?? 0),
                        ),
                      )}
                    </div>
                  ))}
              </>
            ) : (
              <>
                {action === "refund" &&
                  field("amount", "Refund amount in cents", "number")}
                {field("reason", "Reason")}
              </>
            )}
            <p className="admin-help">
              The API validates the order state, remaining refundable balance
              and eligible quantities. Refund requests are idempotent.
            </p>
            {row && Array.isArray(row.items) && (
              <div className="admin-card">
                <h3>Order items</h3>
                {(row.items as Row[]).map((item) => (
                  <p key={value(item, "id")}>
                    {value(item, "title")} · {value(item, "quantity")} units
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        {section === "returns" && (
          <>
            <label>
              Return action
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                <option value="approve">Approve request</option>
                <option value="reject">Reject request</option>
                <option value="receive">Receive returned goods</option>
                <option value="refund">Resolve with refund</option>
              </select>
            </label>
            <label className="admin-check">
              <input type="checkbox" name="restock" />
              Restock eligible returned items
            </label>
            <p className="admin-help">
              Only valid return-state transitions are accepted.
            </p>
          </>
        )}
        {section === "promotions" && (
          <>
            {field("name", "Promotion name")}
            {!row && field("code", "Coupon code", "text", "", false)}
            {row && Array.isArray(row.coupons) && (
              <p className="admin-help">
                Coupon codes:{" "}
                {(row.coupons as Row[])
                  .map((coupon) => value(coupon, "code"))
                  .join(", ") || "Automatic promotion"}
              </p>
            )}
            <label>
              Discount type
              <select
                name="kind"
                defaultValue={row ? value(row, "kind") : "percent"}
              >
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed cents</option>
                <option value="free_shipping">Free shipping</option>
                <option value="bogo">Buy one get one</option>
              </select>
            </label>
            {field(
              "value",
              "Percentage or fixed cents",
              "number",
              row ? value(row, "value") : 10,
            )}
            {field(
              "minimumSpendCents",
              "Minimum spend in cents",
              "number",
              row ? value(row, "minimumSpendCents") : 0,
            )}
            {field(
              "usageLimit",
              "Total usage limit (blank for unlimited)",
              "number",
              row ? value(row, "usageLimit") : 100,
              false,
            )}
            {field(
              "perCustomerLimit",
              "Uses per customer",
              "number",
              row ? value(row, "perCustomerLimit") : 1,
            )}
            {field(
              "startsAt",
              "Starts at",
              "datetime-local",
              row && row.startsAt
                ? localDate(String(row.startsAt))
                : localDate(new Date()),
            )}
            {field(
              "endsAt",
              "Ends at",
              "datetime-local",
              row?.endsAt ? localDate(String(row.endsAt)) : "",
              false,
            )}
            <label className="admin-check">
              <input
                type="checkbox"
                name="active"
                defaultChecked={row ? Boolean(row.active) : true}
              />
              Active
            </label>
          </>
        )}
        {section === "giftcards" && (
          <>
            {field("code", "Gift card code", "text")}
            {field("initialCents", "Initial credit in cents", "number", 100)}
            {field("expiresAt", "Expiry", "datetime-local", "", false)}
            <p className="admin-help">
              Issuing a gift card creates a monetary ledger entry. Balances
              cannot be overwritten directly.
            </p>
          </>
        )}
        {section === "reviews" && (
          <>
            <p>{row ? value(row, "body") : ""}</p>
            <label>
              Moderation decision
              <select
                name="status"
                defaultValue={row ? value(row, "status") : "pending"}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </>
        )}
        {section === "content" && (
          <>
            {field("title", "Page title")}
            <label>
              Content
              <textarea
                name="body"
                rows={12}
                defaultValue={row ? value(row, "body") : ""}
              />
            </label>
            <label className="admin-check">
              <input
                name="published"
                type="checkbox"
                defaultChecked={Boolean(row?.published)}
              />
              Published
            </label>
            <p className="admin-help">
              Plain text content is rendered safely. Markup is not executed.
            </p>
          </>
        )}
        {section === "featureflags" && (
          <label className="admin-check">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={Boolean(row?.enabled)}
            />
            Enable {row ? value(row, "key") : "feature"}
          </label>
        )}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="admin-primary" disabled={saving} type="submit">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>
      {section === "products" && row && Array.isArray(row.variants) && (
        <section className="admin-variant-editors">
          <h3>Variant pricing</h3>
          {(row.variants as Row[]).map((variant) => (
            <VariantEditor key={value(variant, "id")} row={variant} />
          ))}
        </section>
      )}
      {section === "inventory" && row && <Movements id={value(row, "id")} />}
    </dialog>
  );
}

function VariantEditor({ row }: { row: Row }) {
  const [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  return (
    <details>
      <summary>
        {value(row, "sku")} · {value(row, "name")}
      </summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          setSaving(true);
          try {
            await request(`/admin/variants/${value(row, "id")}`, {
              method: "PATCH",
              body: JSON.stringify({
                name: f.get("name"),
                sku: f.get("sku"),
                priceCents: Number(f.get("priceCents")),
                backorder: f.get("backorder") === "on",
              }),
            });
            setMessage("Variant saved.");
          } catch (err) {
            setMessage((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          Variant name
          <input name="name" defaultValue={value(row, "name")} required />
        </label>
        <label>
          SKU
          <input
            name="sku"
            defaultValue={value(row, "sku")}
            minLength={2}
            required
          />
        </label>
        <label>
          Variant price in cents
          <input
            name="priceCents"
            type="number"
            min={1}
            step={1}
            defaultValue={value(row, "priceCents")}
            required
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            name="backorder"
            defaultChecked={Boolean(row.backorder)}
          />
          Allow backorder
        </label>
        <button disabled={saving}>{saving ? "Saving…" : "Save variant"}</button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
function Movements({ id }: { id: string }) {
  const [items, setItems] = useState<Row[]>([]),
    [message, setMessage] = useState("Loading movement history…");
  useEffect(() => {
    request<{ items: Row[] }>(`/admin/inventory/${id}/movements`)
      .then((result) => {
        setItems(result.items);
        setMessage("");
      })
      .catch((err) => setMessage(err.message));
  }, [id]);
  return (
    <section className="admin-variant-editors">
      <h3>Stock movement history</h3>
      <p>{message}</p>
      {items.length
        ? items.map((item) => (
            <div className="admin-summary-row" key={value(item, "id")}>
              <span>{value(item, "kind")}</span>
              <span>{value(item, "quantity")}</span>
              <span>{value(item, "reason")}</span>
            </div>
          ))
        : !message && <p>No stock movements yet.</p>}
    </section>
  );
}

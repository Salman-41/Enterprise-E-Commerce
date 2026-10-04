export type Cell =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | unknown[];
export type Row = Record<string, Cell>;
export type Page = { items: Row[]; total: number; page: number; limit: number };
export const sections = [
  "dashboard",
  "products",
  "inventory",
  "orders",
  "returns",
  "customers",
  "promotions",
  "giftcards",
  "loyalty",
  "reviews",
  "content",
  "audit",
  "jobs",
  "webhooks",
  "roles",
  "featureflags",
  "health",
] as const;
export type Section = (typeof sections)[number];
export const labels: Record<Section, string> = {
  dashboard: "Overview",
  products: "Catalog",
  inventory: "Inventory",
  orders: "Orders",
  returns: "Returns",
  customers: "Customers",
  promotions: "Promotions",
  giftcards: "Gift cards",
  loyalty: "Loyalty ledger",
  reviews: "Review moderation",
  content: "Editorial content",
  audit: "Audit trail",
  jobs: "Background jobs",
  webhooks: "Webhook deliveries",
  roles: "Access & roles",
  featureflags: "Feature flags",
  health: "System health",
};
export const value = (row: Row, key: string): string => String(row[key] ?? "");
export function csv(rows: Row[]): string {
  const keys = Array.from(new Set(rows.flatMap(Object.keys)));
  const escape = (input: unknown) => {
    const raw =
      typeof input === "object" && input !== null
        ? JSON.stringify(input)
        : String(input ?? "");
    const safe = /^[=+@-]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [
    keys.map(escape).join(","),
    ...rows.map((row) => keys.map((key) => escape(row[key])).join(",")),
  ].join("\r\n");
}
export function present(input: Cell, key = ""): string {
  if (input === null || input === undefined) return "—";
  if (typeof input === "boolean") return input ? "Yes" : "No";
  if (typeof input === "object") {
    if (Array.isArray(input)) return `${input.length} entries`;
    return String(
      input.name ?? input.title ?? input.email ?? input.id ?? "Details",
    );
  }
  if (/(?:At|Date)$/.test(key) && typeof input === "string")
    return new Date(input).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return String(input);
}

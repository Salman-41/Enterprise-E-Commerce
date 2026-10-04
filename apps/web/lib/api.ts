export type Variant = {
  id: string;
  sku: string;
  priceCents?: number;
  name?: string;
  title?: string;
  color?: string;
  size?: string;
  price: number;
  stock?: number;
  available?: number;
  options?: Record<string, string>;
};
export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number | null;
  rating?: number;
  brand?: { name: string; slug: string };
  category?: { name: string; slug: string };
  media?: { url: string; alt?: string }[];
  image?: string;
  variants?: Variant[];
  reviews?: {
    id: string;
    rating: number;
    title?: string;
    body: string;
    user?: { name: string };
    verified?: boolean;
  }[];
  questions?: {
    id: string;
    question: string;
    answers: { id: string; body: string }[];
  }[];
  specifications?: Record<string, string>;
};
export type Catalog = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  facets?: {
    brands?: { name: string; slug: string }[];
    categories?: { name: string; slug: string }[];
  };
};
export type CartItem = {
  id: string;
  quantity: number;
  unitPrice?: number;
  price?: number;
  variant: Variant & { product: Product };
};
export type Cart = {
  id: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
};
export type Order = {
  id: string;
  number?: string;
  orderNumber?: string;
  status: string;
  email: string;
  total: number;
  trackingToken: string;
  createdAt: string;
  items?: {
    id: string;
    name?: string;
    productName?: string;
    quantity: number;
    unitPrice: number;
  }[];
  history?: { id: string; status: string; createdAt: string; note?: string }[];
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(
      body.message ||
        body.error?.message ||
        "The request could not be completed.",
      res.status,
      body.code,
    );
  return normalizeResponse(path, body) as T;
}
export async function serverApi<T>(path: string): Promise<T> {
  const res = await fetch(
    `${process.env.API_URL || "http://localhost:4000"}/api/v1${path}`,
    { cache: "no-store" },
  );
  if (!res.ok)
    throw new ApiError(
      "The store could not load this page. Check the API service.",
      res.status,
    );
  return normalizeResponse(path, await res.json()) as T;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const productImage = (p: Product) =>
  p.media?.[0]?.url || p.image || "/products/object.svg";

function normalizeProduct(input: unknown): Product {
  const p = input as Product & {
    priceCents: number;
    compareAtPriceCents?: number;
    imageUrl?: string;
    images?: string[];
    categories?: { name: string; slug: string }[];
    variants?: Array<Variant & { priceCents: number }>;
  };
  return {
    ...p,
    reviews: p.reviews?.map((r) => ({
      ...r,
      user: { name: (r as unknown as { author: string }).author || "Customer" },
      verified: (r as unknown as { verifiedPurchase: boolean })
        .verifiedPurchase,
    })),
    price: p.priceCents ?? p.price,
    compareAtPrice: p.compareAtPriceCents ?? p.compareAtPrice,
    image: p.imageUrl ?? p.image,
    category: p.categories?.[0] ?? p.category,
    media: p.media ?? p.images?.map((url) => ({ url })),
    variants: p.variants?.map((v) => ({
      ...v,
      price: v.priceCents ?? v.price,
      color: v.options?.color ?? v.color,
      size: v.options?.size ?? v.size,
    })),
  };
}
function normalizeResponse(path: string, body: unknown): unknown {
  if (path.startsWith("/catalog/products")) {
    const v = body as { items?: unknown[] };
    return v.items
      ? { ...v, items: v.items.map(normalizeProduct) }
      : normalizeProduct(body);
  }
  if (path.startsWith("/account/wishlist")) {
    const v = body as { items?: unknown[] };
    if (v.items) return { ...v, items: v.items.map(normalizeProduct) };
  }
  return body;
}

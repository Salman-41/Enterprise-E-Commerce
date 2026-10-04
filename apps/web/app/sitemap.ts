import type { MetadataRoute } from "next";
import { serverApi, Catalog } from "@/lib/api";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.WEB_URL || "http://localhost:3000";
  const products = await serverApi<Catalog>("/catalog/products?limit=200");
  return [
    ...[
      "",
      "/shop",
      "/collections",
      "/about",
      "/contact",
      "/shipping",
      "/returns",
    ].map((path) => ({ url: base + path, lastModified: new Date() })),
    ...products.items.map((p) => ({
      url: `${base}/products/${p.slug}`,
      lastModified: new Date(),
    })),
  ];
}

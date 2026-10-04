import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/checkout", "/orders"],
    },
    sitemap: `${process.env.WEB_URL || "http://localhost:3000"}/sitemap.xml`,
  };
}

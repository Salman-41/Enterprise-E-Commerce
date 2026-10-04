import type { Metadata } from "next";
import { Header, Footer } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_URL || "http://localhost:3000"),
  title: {
    default: "FIELDWORK — Everyday, considered",
    template: "%s | FIELDWORK",
  },
  description:
    "An independent edit of thoughtful objects for home, work and the world outside.",
  openGraph: {
    title: "FIELDWORK",
    description: "Everyday, considered.",
    type: "website",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

import Link from "next/link";
import Image from "next/image";
import { serverApi } from "@/lib/api";
export const metadata = { title: "Collections" };
export default async function Collections() {
  const items = await serverApi<{
    items: { id: string; name: string; slug: string; description?: string }[];
  }>("/catalog/collections");
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">AN INDEPENDENT POINT OF VIEW</p>
        <h1>A considered collection.</h1>
        <p>Different ways to bring good design into the everyday.</p>
      </div>
      <section className="section collection-tiles">
        {items.items.map((c, i) => (
          <Link href={`/collections/${c.slug}`} key={c.id}>
            <Image
              src={
                [
                  "/products/home.svg",
                  "/products/bag.svg",
                  "/products/desk.svg",
                ][i % 3]
              }
              alt={c.name}
              width={700}
              height={600}
            />
            <span>
              {c.name}
              <b>↗</b>
            </span>
            <p>{c.description}</p>
          </Link>
        ))}
      </section>
    </>
  );
}

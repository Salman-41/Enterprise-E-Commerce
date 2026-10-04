import { RecentlyViewed } from "@/components/recently-viewed";
import Link from "next/link";
import Image from "next/image";
import { serverApi, Catalog } from "@/lib/api";
import { ProductCard } from "@/components/product-card";
export default async function Home() {
  const data = await serverApi<Catalog>(
    "/catalog/products?limit=8&sort=newest",
  );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">THE EVERYDAY EDIT / NO. 01</p>
          <h1>
            A little less.
            <br />A lot better.
          </h1>
          <p className="hero-description">
            Useful objects. Lasting design.
            <br />A thoughtful collection for the way you live.
          </p>
          <Link className="button" href="/shop">
            Explore the edit <span>↗</span>
          </Link>
          <div className="hero-foot">
            HOME / WORK / OUTSIDE{" "}
            <span>Thoughtfully selected. Independently made.</span>
          </div>
        </div>
        <div className="hero-art">
          <Image
            src="/editorial/living-room.jpg"
            fill
            priority
            alt="A thoughtful interior with a sculptural chair and floor lamp"
            sizes="(max-width:800px) 100vw,55vw"
          />
          <span className="image-caption">
            A place for everything. Space for a little more.
          </span>
        </div>
      </section>
      <div className="values-strip">
        <span>01 / MADE TO BE USED</span>
        <span>02 / DETAILS THAT MATTER</span>
        <span>03 / KEEP FOR LONGER</span>
        <span>04 / EVERYDAY, CONSIDERED</span>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">JUST ADDED TO THE EDIT</p>
            <h2>New & noteworthy.</h2>
          </div>
          <Link href="/shop?sort=newest">View all arrivals ↗</Link>
        </div>
        <div className="product-grid">
          {data.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <section className="editorial">
        <div className="editorial-picture">
          <Image
            src="/editorial/reading-room.jpg"
            alt="A quiet workspace with carefully selected objects"
            width={1000}
            height={800}
            sizes="(max-width:800px) 100vw,60vw"
          />
        </div>
        <div className="editorial-copy">
          <p className="eyebrow">THE WAY WE CHOOSE</p>
          <h2>
            Fewer things.
            <br />
            More meaning.
          </h2>
          <p>
            We look for a balance of useful, beautiful and enduring. Objects
            that earn their place, feel good in your hands and make ordinary
            moments a little better.
          </p>
          <Link className="text-link" href="/about">
            Meet Fieldwork ↗
          </Link>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIND YOUR EVERYDAY</p>
            <h2>Good company.</h2>
          </div>
          <Link href="/collections">Discover collections ↗</Link>
        </div>
        <div className="collection-tiles">
          <Link href="/shop?category=home">
            <Image
              src="/products/home.svg"
              width={700}
              height={600}
              alt="Objects for a considered home"
            />
            <span>
              At home <b>01 ↗</b>
            </span>
          </Link>
          <Link href="/shop?category=bags">
            <Image
              src="/products/bag.svg"
              width={700}
              height={600}
              alt="A canvas carryall"
            />
            <span>
              Out in the world <b>02 ↗</b>
            </span>
          </Link>
          <Link href="/shop?category=accessories">
            <Image
              src="/products/desk.svg"
              width={700}
              height={600}
              alt="Desk essentials"
            />
            <span>
              Room to think <b>03 ↗</b>
            </span>
          </Link>
        </div>
      </section>
      <RecentlyViewed />
    </>
  );
}

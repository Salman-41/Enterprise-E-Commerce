import { SearchForm } from "@/components/search-form";
import Link from "next/link";
export const metadata = { title: "Search" };
export default function Search() {
  return (
    <div className="content-page">
      <p className="eyebrow">A LITTLE DISCOVERY</p>
      <h1>
        What are you
        <br />
        looking for?
      </h1>
      <SearchForm />
      <p>Popular searches</p>
      <div className="inline-actions">
        <Link href="/shop?q=linen">Linen</Link>
        <Link href="/shop?category=bags">Everyday carry</Link>
        <Link href="/shop?category=home">Objects for home</Link>
      </div>
    </div>
  );
}

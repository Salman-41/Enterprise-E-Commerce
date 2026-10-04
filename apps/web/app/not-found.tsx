import Link from "next/link";
export default function NotFound() {
  return (
    <section className="empty-state">
      <p className="eyebrow">404 / NOT IN THE EDIT</p>
      <h1>Let’s find something good.</h1>
      <p>
        This page has moved, or the object you’re looking for is no longer
        available.
      </p>
      <Link className="button" href="/shop">
        Explore the store ↗
      </Link>
    </section>
  );
}

"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
export function Header() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  return (
    <>
      <div className="announcement">
        Objects with purpose. Everyday, considered.{" "}
        <Link href="/shipping">Complimentary shipping over $150 ↗</Link>
      </div>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Fieldwork home">
          FIELDWORK<span>®</span>
        </Link>
        <nav
          aria-label="Main navigation"
          className={open ? "main-nav open" : "main-nav"}
        >
          <Link href="/shop">Shop all</Link>
          <Link href="/shop?sort=newest">New arrivals</Link>
          <Link href="/collections">Collections</Link>
          <Link href="/about">Our approach</Link>
        </nav>
        <div className="header-tools">
          <Link href="/search" aria-label="Search">
            ⌕
          </Link>
          <Link href="/account" aria-label="Your account">
            Account
          </Link>
          <Link href="/cart" aria-label="Shopping bag">
            Bag ↗
          </Link>
          <button
            className="menu-toggle"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            Menu
          </button>
        </div>
      </header>
    </>
  );
}
export function Newsletter() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="newsletter-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/catalog/newsletter", {
            method: "POST",
            body: JSON.stringify({
              email: new FormData(e.currentTarget).get("email"),
            }),
          });
          setMessage("You’re on the list. Thank you.");
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="newsletter">
        A considered inbox. New objects, thoughtful stories.
      </label>
      <div>
        <input
          id="newsletter"
          name="email"
          type="email"
          required
          placeholder="Your email address"
        />
        <button disabled={busy} aria-label="Subscribe to newsletter">
          {busy ? "…" : "Join ↗"}
        </button>
      </div>
      <p role="status">{message}</p>
    </form>
  );
}
export function Footer() {
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <h2>
          Good things.
          <br />
          For the everyday.
        </h2>
        <Newsletter />
      </div>
      <div className="footer-links">
        <Link href="/contact">Contact</Link>
        <Link href="/faq">Questions</Link>
        <Link href="/shipping">Shipping</Link>
        <Link href="/returns">Returns</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/track">Track an order</Link>
        <Link href="/admin">Operations</Link>
      </div>
      <div className="footer-bottom">
        <span>FIELDWORK® — An independent edit.</span>
        <span>Local demo store · USD</span>
        <span>© {new Date().getFullYear()} Fieldwork</span>
      </div>
    </footer>
  );
}

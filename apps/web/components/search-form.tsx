"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
type Suggestion = { id: string; slug: string; name: string };
export function SearchForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRecent(
        JSON.parse(localStorage.getItem("fieldwork-searches-v1") || "[]"),
      );
    } catch {
      setRecent([]);
    }
  }, []);
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      api<{ items: Suggestion[] }>(
        `/catalog/search/suggestions?q=${encodeURIComponent(query)}`,
        { signal: abort.signal },
      )
        .then((v) => setResults(v.items))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query]);
  return (
    <>
      <form
        action="/shop"
        className="search-bar"
        onSubmit={() => {
          localStorage.setItem(
            "fieldwork-searches-v1",
            JSON.stringify(
              [query, ...recent.filter((x) => x !== query)].slice(0, 5),
            ),
          );
        }}
      >
        <input
          name="q"
          aria-label="Search products"
          placeholder="Try linen, lighting, everyday carry…"
          autoFocus
          required
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="button">Search ↗</button>
      </form>
      {results.length > 0 && (
        <ul
          style={{ listStyle: "none", padding: 0 }}
          aria-label="Suggested products"
        >
          {results.map((r) => (
            <li
              key={r.id}
              style={{
                borderBottom: "1px solid var(--line)",
                padding: "12px 0",
              }}
            >
              <Link href={`/products/${r.slug}`}>{r.name} ↗</Link>
            </li>
          ))}
        </ul>
      )}
      {recent.length > 0 && (
        <>
          <p>Recent searches</p>
          <div className="inline-actions">
            {recent.map((s) => (
              <Link href={`/shop?q=${encodeURIComponent(s)}`} key={s}>
                {s}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

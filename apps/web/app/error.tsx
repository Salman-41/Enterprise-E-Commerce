"use client";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <section className="empty-state">
      <p className="eyebrow">A PAUSE, NOT AN END</p>
      <h1>We couldn’t load this page.</h1>
      <p>{error.message}</p>
      <button className="button" onClick={reset}>
        Try again ↗
      </button>
    </section>
  );
}

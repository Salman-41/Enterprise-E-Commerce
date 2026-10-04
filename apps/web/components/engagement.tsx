"use client";
import { useState } from "react";
import { api } from "@/lib/api";
export function Engagement({ productId }: { productId: string }) {
  const [message, setMessage] = useState("");
  return (
    <section className="section">
      <div className="form-grid">
        <form
          className="form-stack panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await api("/account/reviews", {
                method: "POST",
                body: JSON.stringify({
                  productId,
                  rating: Number(f.get("rating")),
                  title: f.get("title"),
                  body: f.get("body"),
                }),
              });
              setMessage("Review submitted for moderation. Thank you.");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <h3>Share your everyday experience</h3>
          <p style={{ fontSize: 12 }}>
            Sign in with an eligible purchase to write a verified review.
          </p>
          <label className="field">
            Rating
            <select name="rating">
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} out of 5
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Review title
            <input name="title" minLength={3} required />
          </label>
          <label className="field">
            Your review
            <textarea name="body" minLength={10} required />
          </label>
          <button className="button secondary">Submit review</button>
        </form>
        <form
          className="form-stack panel"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/account/questions", {
                method: "POST",
                body: JSON.stringify({
                  productId,
                  question: new FormData(e.currentTarget).get("question"),
                }),
              });
              setMessage("Your question is with our team.");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <h3>A question about this object?</h3>
          <p style={{ fontSize: 12 }}>
            Sign in and ask our team. Answers are moderated for clarity.
          </p>
          <label className="field">
            Your question
            <textarea name="question" minLength={5} required />
          </label>
          <button className="button secondary">Ask a question</button>
        </form>
      </div>
      <p role="status">{message}</p>
    </section>
  );
}

"use client";
import { useState } from "react";
import { api } from "@/lib/api";
export function Contact() {
  const [message, setMessage] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        try {
          await api("/catalog/contact", {
            method: "POST",
            body: JSON.stringify(
              Object.fromEntries(new FormData(form).entries()),
            ),
          });
          setMessage("Your message has reached our team. Thank you.");
          form.reset();
        } catch (e) {
          setMessage((e as Error).message);
        }
      }}
    >
      <div className="form-grid">
        <label className="field">
          Name
          <input name="name" required />
        </label>
        <label className="field">
          Email
          <input name="email" type="email" required />
        </label>
      </div>
      <label className="field">
        How can we help?
        <textarea name="message" required minLength={10} />
      </label>
      <button className="button">Send message ↗</button>
      <p role="status">{message}</p>
    </form>
  );
}

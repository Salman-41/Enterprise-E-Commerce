"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
export function AuthToken({
  mode,
  token,
}: {
  mode: "verify" | "reset";
  token: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode === "verify")
      api("/auth/verify", { method: "POST", body: JSON.stringify({ token }) })
        .then(() => setMessage("Your email is verified."))
        .catch((e) => setMessage(e.message));
  }, [mode, token]);
  return (
    <div className="auth-page">
      <p className="eyebrow">YOUR FIELDWORK ACCOUNT</p>
      <h1>{mode === "verify" ? "A little confirmation." : "A fresh start."}</h1>
      {mode === "reset" && (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/auth/reset-password", {
                method: "POST",
                body: JSON.stringify({
                  token,
                  password: new FormData(e.currentTarget).get("password"),
                }),
              });
              setMessage("Your password is updated. You can sign in again.");
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            New password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <button className="button" disabled={busy}>
            Update password ↗
          </button>
        </form>
      )}
      <p role="status">{message || "Checking your link…"}</p>
      <Link className="text-link" href="/account">
        Your account ↗
      </Link>
    </div>
  );
}

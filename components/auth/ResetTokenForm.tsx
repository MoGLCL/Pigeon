"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetTokenForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirmPassword"))) {
      setError("Passwords do not match");
      setPending(false);
      return;
    }
    const response = await fetch(`/api/auth/forgot-password/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Something went wrong");
      setPending(false);
      return;
    }
    router.push("/login?reset=1");
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        New password
        <input name="password" required type="password" minLength={10} autoComplete="new-password" placeholder="At least 10 characters" />
      </label>
      <label>
        Confirm new password
        <input name="confirmPassword" required type="password" minLength={10} autoComplete="new-password" placeholder="Repeat your password" />
      </label>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>
        Must be at least 10 characters with uppercase, lowercase, and a number.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button auth-submit" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    const identifier = String(data.get("identifier") || data.get("email"));
    const password = String(data.get("password"));
    if (mode === "register") {
      if (password !== String(data.get("confirmPassword"))) { setError("Passwords do not match"); setPending(false); return; }
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: data.get("name"), username: data.get("username"), email: data.get("email"), password }) });
      if (!response.ok) { const body = await response.json(); setError(body.error); setPending(false); return; }
    } else {
      const statusResponse = await fetch("/api/auth/account-status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password }) });
      const statusBody = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok) { setError(statusBody.error || "Invalid credentials"); setPending(false); return; }
      if (statusBody.status === "suspended" || statusBody.status === "banned") { setError(`Your account is ${statusBody.status}. Use the support link below if you believe this is a mistake.`); setPending(false); return; }
    }
    const result = await signIn("credentials", { email: identifier, password, redirect: false });
    if (result?.error) { setError("Invalid credentials or inactive account"); setPending(false); return; }
    const me = await fetch("/api/me").then(r => r.ok ? r.json() : null);
    router.push(me?.role === "admin" ? "/admin" : me?.role === "moderator" ? "/reports" : "/"); router.refresh();
  }
  return <form className="auth-form" onSubmit={submit}>
    {mode === "register" && <div className="auth-field-grid"><label>Full name<input name="name" required minLength={2} autoComplete="name" placeholder="Your full name" /></label><label>Username<input name="username" required minLength={3} pattern="[a-zA-Z0-9_]+" autoComplete="username" placeholder="your_username" /></label></div>}
    <label>{mode === "login" ? "Email or username" : "Email address"}<input name={mode === "login" ? "identifier" : "email"} required type={mode === "login" ? "text" : "email"} autoComplete={mode === "login" ? "username" : "email"} placeholder={mode === "login" ? "you@example.com or username" : "you@example.com"} /></label>
    <label>Password<input name="password" required type="password" minLength={mode === "register" ? 10 : 8} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="••••••••••" /></label>
    {mode === "login" && <a className="forgot-link" href="/forgot-password">Forgot password?</a>}
    {mode === "register" && <label>Confirm password<input name="confirmPassword" required type="password" minLength={10} autoComplete="new-password" placeholder="Repeat your password" /></label>}
    {error && <p className="form-error" role="alert">{error}{mode==="login"&&error.includes("account is")?<><br/><a href="/support">Contact support without signing in</a></>:null}</p>}
    <button className="primary-button auth-submit" disabled={pending}>{pending ? "Please wait…" : mode === "login" ? "Sign in to Pigeon" : "Create my account"}</button>
  </form>;
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LogOut, ShieldCheck, X } from "lucide-react";

type Props = {
  open: boolean;
  deviceName: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (password: string) => void | Promise<void>;
};

export function PasswordConfirmDialog({ open, deviceName, busy = false, error = "", onCancel, onConfirm }: Props) {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    if (!open) return;
    setPassword("");
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", keydown);
    return () => { window.clearTimeout(timer); document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [open, busy, onCancel]);
  if (!open) return null;
  return <div className="modal-backdrop confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
    <section className="confirm-dialog session-password-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div className="confirm-dialog-icon session-confirm-icon"><ShieldCheck size={22}/></div>
      <button type="button" className="icon-button confirm-close" onClick={onCancel} disabled={busy} aria-label="Close"><X size={18}/></button>
      <div className="confirm-dialog-copy"><h2 id={titleId}>Disconnect this session?</h2><p id={descriptionId}>Confirm your account password before removing access from <strong>{deviceName}</strong>.</p></div>
      <form className="session-password-form" onSubmit={(event) => { event.preventDefault(); if (password.length >= 8) void onConfirm(password); }}>
        <label htmlFor={`${titleId}-password`}>Account password</label>
        <input ref={inputRef} id={`${titleId}-password`} type="password" autoComplete="current-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy}/>
        <small>This verifies it is really you. Your password is never stored with the session action.</small>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="modal-actions confirm-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="primary-button destructive-button" disabled={busy || password.length < 8}><LogOut size={15}/>{busy ? "Verifying…" : "Disconnect session"}</button></div>
      </form>
    </section>
  </div>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  requireText?: string;
  busy?: boolean;
  tone?: "danger" | "neutral";
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  requireText,
  busy = false,
  tone = "danger",
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    setValue("");
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", keydown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [open, busy, onCancel]);
  if (!open) return null;
  const allowed = !requireText || value === requireText;
  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <section className={`confirm-dialog is-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <div className="confirm-dialog-icon"><AlertTriangle size={22} /></div>
        <button className="icon-button confirm-close" onClick={onCancel} disabled={busy} aria-label="Close"><X size={18} /></button>
        <div className="confirm-dialog-copy">
          <h2 id="confirm-title">{title}</h2>
          <p id="confirm-description">{description}</p>
          {requireText ? (
            <label>
              Type <strong>{requireText}</strong> to continue
              <input autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} placeholder={requireText} />
            </label>
          ) : null}
        </div>
        <div className="modal-actions confirm-actions">
          <button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={tone === "danger" ? "primary-button destructive-button" : "primary-button"} onClick={() => void onConfirm()} disabled={busy || !allowed}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function VisitTracker() {
  const path = usePathname();
  useEffect(() => {
    let visitorId = localStorage.getItem("pigeon:visitor-id");
    if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem("pigeon:visitor-id", visitorId); }
    void fetch("/api/analytics/visit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visitorId, path }), keepalive: true });
  }, [path]);
  return null;
}

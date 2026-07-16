"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type SiteState = { mode?: string; owner?: boolean; name?: string; logo?: string };

export function SiteStatusGate() {
  const path = usePathname();
  const [state, setState] = useState<SiteState>({});
  useEffect(() => {
    Promise.all([
      fetch("/api/site/status", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/me", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    ]).then(([site, me]) => setState({
      mode: site.site_mode || "live",
      owner: me?.role === "owner",
      name: site.site_name?.trim() || "Pigeon",
      logo: site.site_logo_url || "/brand/pigeon-auth.png",
    }));
  }, [path]);
  if (state.owner || state.mode === "live" || path.startsWith("/login") || path.startsWith("/forgot") || path.startsWith("/recover")) return null;
  if (!state.mode) return null;
  return <div className="site-status-screen">
    <img className="site-status-logo" src={state.logo} alt={`${state.name || "Site"} logo`}/>
    <span className="eyebrow">{state.name} status</span>
    <h1>{state.mode === "maintenance" ? "We’ll be right back." : "This site is currently closed."}</h1>
    <p>{state.mode === "maintenance" ? "Scheduled maintenance is in progress. Please try again shortly." : "The owner has temporarily disabled access."}</p>
  </div>;
}

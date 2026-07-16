import type { Metadata } from "next";
import "./globals.css";
import { VisitTracker } from "@/components/analytics/VisitTracker";
import { SiteStatusGate } from "@/components/layout/SiteStatusGate";

export const metadata: Metadata = {
  title: "Pigeon — Communications dashboard",
  description: "Manage business conversations across Facebook and WhatsApp.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><VisitTracker /><SiteStatusGate />{children}</body>
    </html>
  );
}

import {
  Bot,
  ContactRound,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { FaFacebookF, FaFacebookMessenger, FaWhatsapp } from "react-icons/fa";
import type { IconType } from "react-icons";
import type { LucideIcon } from "lucide-react";
export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon | IconType;
  tone?: "facebook" | "whatsapp";
};
export const navigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Facebook", href: "/facebook", icon: FaFacebookF, tone: "facebook" },
  {
    label: "Messenger",
    href: "/messenger",
    icon: FaFacebookMessenger,
    tone: "facebook",
  },
  { label: "WhatsApp", href: "/whatsapp", icon: FaWhatsapp, tone: "whatsapp" },
  { label: "Automation", href: "/automation", icon: Bot },
  { label: "Broadcast", href: "/broadcast", icon: Megaphone },
  { label: "Contacts", href: "/contacts", icon: ContactRound },
  { label: "Reports & tickets", href: "/reports", icon: ShieldAlert },
  { label: "Settings", href: "/settings", icon: Settings },
];

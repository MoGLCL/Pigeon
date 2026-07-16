import { CheckCheck, MessageCircleMore, Reply, UsersRound } from "lucide-react";
export const dashboardStats = [
  { key: "total", label: "Total messages", icon: MessageCircleMore },
  { key: "delivered", label: "Delivered", icon: CheckCheck },
  { key: "replies", label: "Your replies", icon: Reply },
  { key: "contacts", label: "New contacts", icon: UsersRound },
] as const;

import { Dashboard } from "@/features/dashboard/Dashboard";
import { guardPage } from "@/lib/page-auth";

export default async function Home() {
  await guardPage("/");
  return <Dashboard />;
}

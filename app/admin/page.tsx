import { redirect } from "next/navigation";import { AdminFrame } from "@/components/admin/AdminFrame";import { AdminDashboard } from "@/components/admin/AdminDashboard";import { guardPage } from "@/lib/page-auth";
export default async function Page(){const user=await guardPage("/admin");if(user.role==="moderator")redirect("/admin/reports");return <AdminFrame><AdminDashboard/></AdminFrame>}

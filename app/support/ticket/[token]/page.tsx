import Link from "next/link";
import { Brand } from "@/components/brand/Brand";
import { PublicSupportTicket } from "@/components/auth/PublicSupportTicket";
export default async function Page({params}:{params:Promise<{token:string}>}){return <main className="public-ticket-page"><nav><Brand/><Link href="/faq">FAQ</Link></nav><section><PublicSupportTicket token={(await params).token}/></section></main>}

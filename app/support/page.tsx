import Link from "next/link";
import { Brand } from "@/components/brand/Brand";
import { PublicSupportForm } from "@/components/auth/PublicSupportForm";
export default function Page(){return <main className="recovery-page"><section className="recovery-card public-support-card"><Brand/><div><h1>Contact support</h1><p>You do not need to sign in. Include your account email and a clear description of the problem.</p></div><PublicSupportForm/><Link className="back-link" href="/login">Back to sign in</Link></section></main>}

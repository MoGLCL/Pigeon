import Link from "next/link";
import { Brand } from "@/components/brand/Brand";
import { siteMeta } from "@/config/site-meta";

export function PublicDocument({title,description,children}:{title:string;description:string;children:React.ReactNode}){
  return <main className="public-doc"><header className="public-doc-nav"><Link href="/" aria-label="Pigeon home"><Brand/></Link><nav><Link href="/faq">FAQ</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link className="primary-button compact" href="/login">Open Pigeon</Link></nav></header><article><header><h1>{title}</h1><p>{description}</p><small>Last updated: July 15, 2026</small></header>{children}</article><footer><span>© 2026 Pigeon · Developed by <a href={siteMeta.facebookUrl} target="_blank" rel="noreferrer">{siteMeta.developerName}</a></span><span><a href={siteMeta.facebookUrl} target="_blank" rel="noreferrer">Facebook</a><a href={siteMeta.githubUrl} target="_blank" rel="noreferrer">GitHub</a><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/faq">FAQ</Link></span></footer></main>
}

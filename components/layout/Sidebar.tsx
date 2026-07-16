"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { HelpCircle,Menu,X } from "lucide-react";
import { FaFacebookF,FaGithub } from "react-icons/fa";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { currentUser } from "@/lib/client/current-user";
import { siteMeta } from "@/config/site-meta";
export function Sidebar({open,onClose}:{open:boolean;onClose:()=>void}){const pathname=usePathname();const[role,setRole]=useState("");useEffect(()=>{void currentUser().then(u=>setRole(u?.role||""))},[]);const items=role==="moderator"?navigationItems.filter(x=>x.href==="/reports"):navigationItems;return <><button className={cn("scrim",open&&"is-open")} aria-label="Close navigation" onClick={onClose}/><aside className={cn("sidebar",open&&"is-open")} aria-label="Primary navigation"><div className="brand-row sidebar-close-row"><button className="icon-button mobile-only" onClick={onClose} aria-label="Close menu"><X size={20}/></button></div><nav className="nav-list">{items.map(({label,href,icon:Icon,tone})=><Link key={label} href={href} onClick={onClose} className={cn("nav-item",pathname===href&&"active",tone&&`is-${tone}`)}><Icon size={19}/><span>{label}</span></Link>)}</nav><div className="sidebar-footer"><p className="developer-credit">Developed by <a href={siteMeta.facebookUrl} target="_blank" rel="noreferrer">{siteMeta.developerName}</a></p><div className="social-links"><a href={siteMeta.facebookUrl} target="_blank" rel="noreferrer" aria-label={`${siteMeta.developerName} on Facebook`}><FaFacebookF/></a><a href={siteMeta.githubUrl} target="_blank" rel="noreferrer" aria-label={`${siteMeta.developerName} on GitHub`}><FaGithub/></a></div><Link className="support-link" href="/reports"><HelpCircle size={19}/>Support</Link><div className="sidebar-legal"><Link href="/faq">FAQ</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div></aside></>}
export function MobileMenuButton({onClick}:{onClick:()=>void}){return <button className="icon-button mobile-only" onClick={onClick} aria-label="Open menu"><Menu size={21}/></button>}

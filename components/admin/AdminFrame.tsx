"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {BarChart3,ChevronLeft,LifeBuoy,Settings2,SlidersHorizontal,Users} from "lucide-react";
import {Brand} from "@/components/brand/Brand";
import {PageMotion} from "@/components/ui/PageMotion";
import {currentUser,peekCurrentUser} from "@/lib/client/current-user";
const links=[{label:"Overview",href:"/admin",icon:BarChart3,roles:["owner","admin"]},{label:"Users",href:"/admin/users",icon:Users,roles:["owner","admin"]},{label:"Support",href:"/admin/reports",icon:LifeBuoy,roles:["owner","admin","moderator"]},{label:"Site",href:"/owner/site",icon:Settings2,roles:["owner"]},{label:"Configuration",href:"/owner/config",icon:SlidersHorizontal,roles:["owner"]}];
export function AdminFrame({children}:{children:React.ReactNode}){const path=usePathname();const[role,setRole]=useState(peekCurrentUser()?.role||"");useEffect(()=>{void currentUser().then(me=>setRole(me?.role||""))},[]);return <div className="admin-shell"><header className="admin-topbar"><Brand/><nav className="admin-nav" aria-label="Admin navigation">{links.filter(x=>x.roles.includes(role)).map(({label,href,icon:Icon})=><Link className={path===href?"active":""} href={href} key={href}><Icon size={17}/>{label}</Link>)}</nav><Link className="secondary-button admin-back" href="/"><ChevronLeft size={17}/>Workspace</Link></header><main className="admin-main"><PageMotion>{children}</PageMotion></main></div>}

import { AppFrame } from "@/components/layout/AppFrame";
import { WhatsAppChat } from "@/components/channels/WhatsAppChat";
export default async function Page({params}:{params:Promise<{id:string}>}){return <AppFrame><WhatsAppChat id={(await params).id}/></AppFrame>}

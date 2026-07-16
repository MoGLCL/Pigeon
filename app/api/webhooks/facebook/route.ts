import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { facebookRequest, resolveFacebookCommentAuthor, saveFacebookMessage, saveFacebookComment } from "@/lib/facebook";
import { emitRealtime } from "@/lib/realtime";
import { runtimeConfig } from "@/lib/runtime-config";
import { runAutomation } from "@/lib/automation";

export async function GET(request:Request){const url=new URL(request.url);if(url.searchParams.get("hub.mode")==="subscribe"&&url.searchParams.get("hub.verify_token")===await runtimeConfig("FACEBOOK_WEBHOOK_VERIFY_TOKEN"))return new Response(url.searchParams.get("hub.challenge"));return new Response("Forbidden",{status:403})}

export async function POST(request:Request){
  const raw=await request.text();
  const signature=request.headers.get("x-hub-signature-256")??"";
  const appSecret=await runtimeConfig("FACEBOOK_APP_SECRET");
  if(!appSecret)return new Response("Facebook webhook is not configured",{status:503});
  const expected=`sha256=${createHmac("sha256",appSecret).update(raw).digest("hex")}`;
  if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return new Response("Invalid signature",{status:401});
  const payload=JSON.parse(raw);
  for(const entry of payload.entry??[]){
    const pages=await prisma.facebookPage.findMany({where:{pageId:String(entry.id)}});
    for(const page of pages){
      for(const event of entry.messaging??[]){
        const receivedAt=new Date(event.timestamp??Date.now());
        const isNewEvent=receivedAt>=page.connectedAt;
        const externalId=event.message?.mid??`${page.id}:${event.sender?.id}:${event.timestamp}`;
        const exists=await prisma.webhookEvent.findUnique({where:{source_externalId:{source:"facebook",externalId}}});
        if(exists||!event.message)continue;
        await prisma.webhookEvent.create({data:{source:"facebook",externalId,payload:event}});
        const profile=await facebookRequest<{first_name?:string;last_name?:string;profile_pic?:string}>(page.id,`/${encodeURIComponent(event.sender.id)}?fields=first_name,last_name,profile_pic`).catch(()=>null);
        const participantName=[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||undefined;
        const message=await saveFacebookMessage({pageId:page.id,conversationExternalId:event.sender.id,messageExternalId:event.message.mid,participantId:event.sender.id,participantName,participantAvatarUrl:profile?.profile_pic,content:event.message.text??"[attachment]",fromPage:false,sentAt:receivedAt,attachments:event.message.attachments,notify:isNewEvent,markUnread:isNewEvent});
        emitRealtime(`fb:page:${page.id}`,"message",{id:message.id,conversationId:message.conversationId});
        if(isNewEvent)await runAutomation({channel:"messenger",trigger:"new_message",text:event.message.text??"",accountId:page.id,recipient:event.sender.id,receivedAt});
      }
      for(const change of entry.changes??[])if(change.field==="feed"&&change.value?.item==="comment"){
        const author=await resolveFacebookCommentAuthor(page.id,change.value.from?.id);
        const comment=await saveFacebookComment({pageId:page.id,externalId:change.value.comment_id,postId:change.value.post_id,authorName:author?.name||change.value.from?.name,authorId:change.value.from?.id,authorAvatarUrl:author?.avatarUrl,content:change.value.message??"",postedAt:new Date((change.value.created_time??Date.now()/1000)*1000)});
        emitRealtime(`fb:page:${page.id}`,"comment",{id:comment.id});
        await runAutomation({channel:"facebook_comment",trigger:"new_comment",text:change.value.message??"",accountId:page.id,recipient:change.value.comment_id,receivedAt:new Date((change.value.created_time??Date.now()/1000)*1000)});
      }
    }
  }
  return Response.json({received:true});
}

import { prisma } from "./prisma";
import { sendOpenWaText } from "./openwa-runtime";
import { facebookRequest, saveFacebookMessage } from "./facebook";
import { notifyUser } from "./notifications";

export async function runAutomation(input:{channel:"messenger"|"facebook_comment"|"whatsapp";trigger:string;text:string;accountId:string;recipient:string;receivedAt:Date}){
  const rules=await prisma.automationRule.findMany({where:{channel:input.channel,trigger:{in:[input.trigger,"keyword"]},isActive:true,createdAt:{lte:input.receivedAt},...(input.channel==="whatsapp"?{waAccountId:input.accountId}:{fbPageId:input.accountId})}});
  let completed=0;
  for(const rule of rules){
    if(rule.keywords.length&&!rule.keywords.some(keyword=>input.text.toLowerCase().includes(keyword.toLowerCase())))continue;
    try{
      if(input.channel==="whatsapp"){
        const sent=await sendOpenWaText(rule.waAccountId!,input.recipient,rule.replyMessage);
        const {saveWhatsAppMessage}=await import("./openwa");
        await saveWhatsAppMessage({accountId:rule.waAccountId!,contactPhone:input.recipient,externalId:sent.messageId,fromMe:true,content:rule.replyMessage,status:"sent",sentAt:new Date(sent.timestamp*1000)});
      }
      else if(input.channel==="messenger"){
        const sent=await facebookRequest<{message_id?:string}>(rule.fbPageId!,"/me/messages","POST",{recipient:{id:input.recipient},message:{text:rule.replyMessage}});
        await saveFacebookMessage({pageId:rule.fbPageId!,conversationExternalId:input.recipient,messageExternalId:sent.message_id,participantId:input.recipient,content:rule.replyMessage,fromPage:true,sentAt:new Date()});
      }
      else await facebookRequest(rule.fbPageId!,`/${encodeURIComponent(input.recipient)}/comments`,"POST",{message:rule.replyMessage});
      await prisma.automationRule.update({where:{id:rule.id},data:{lastTriggeredAt:new Date()}});
      await notifyUser({userId:rule.userId,type:"automation_complete",title:`Automation completed: ${rule.name}`,body:`Action ran on ${input.channel.replaceAll("_"," ")}.`,metadata:{href:"/automation",automationId:rule.id}});
      completed++;
    }catch(error){await notifyUser({userId:rule.userId,type:"automation_failed",title:`Automation failed: ${rule.name}`,body:error instanceof Error?error.message:"The action could not be completed.",metadata:{href:"/automation",automationId:rule.id}})}
  }
  return completed;
}

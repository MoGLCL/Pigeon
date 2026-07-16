import{prisma}from"@/lib/prisma";import{sendOpenWaText}from"@/lib/openwa-runtime";import{facebookRequest}from"@/lib/facebook";import{jsonError}from"@/lib/api";import{emitRealtime}from"@/lib/realtime";
import{validCronRequest}from"@/lib/cron-auth";
export async function POST(request:Request){
 if(!await validCronRequest(request))return jsonError("Unauthorized",401);
 const jobs=await prisma.broadcast.findMany({where:{OR:[{status:"scheduled",scheduledAt:{lte:new Date()}},{status:"queued"}]},include:{recipients:{where:{status:"pending"},take:500}},take:10});
 for(const job of jobs){
  await prisma.broadcast.update({where:{id:job.id},data:{status:"sending",startedAt:job.startedAt??new Date()}});
  const senderId=job.attachments&&typeof job.attachments==="object"&&!Array.isArray(job.attachments)&&"senderId"in job.attachments?String(job.attachments.senderId):"";
  const account=job.channel==="whatsapp"?await prisma.whatsAppAccount.findFirst({where:{id:senderId,ownerId:job.userId,status:"connected"}}):null;
  const page=job.channel==="messenger"?await prisma.facebookPage.findFirst({where:{id:senderId,ownerId:job.userId}}):null;
  for(const recipient of job.recipients){try{
   if(job.channel==="whatsapp"&&account&&recipient.phone)await sendOpenWaText(account.id,recipient.phone,job.message);
   else if(job.channel==="messenger"&&page&&recipient.phone)await facebookRequest(page.id,"/me/messages","POST",{recipient:{id:recipient.phone},message:{text:job.message}});
   else throw new Error("No connected sender");
   await prisma.$transaction([prisma.broadcastRecipient.update({where:{id:recipient.id},data:{status:"sent",sentAt:new Date()}}),prisma.broadcast.update({where:{id:job.id},data:{sentCount:{increment:1}}})]);emitRealtime(`broadcast:${job.id}`,"progress",{recipientId:recipient.id,status:"sent"});
  }catch(error){await prisma.$transaction([prisma.broadcastRecipient.update({where:{id:recipient.id},data:{status:"failed",errorMsg:error instanceof Error?error.message:"Send failed"}}),prisma.broadcast.update({where:{id:job.id},data:{failedCount:{increment:1}}})]);emitRealtime(`broadcast:${job.id}`,"progress",{recipientId:recipient.id,status:"failed"});}}
  const pending=await prisma.broadcastRecipient.count({where:{broadcastId:job.id,status:"pending"}});if(!pending)await prisma.broadcast.update({where:{id:job.id},data:{status:"completed",completedAt:new Date()}});
 }
 return Response.json({processed:jobs.length});
}

import { prisma } from "@/lib/prisma";
import { facebookRequest } from "@/lib/facebook";
import { jsonError } from "@/lib/api";
import { notifyUser } from "@/lib/notifications";
import { validCronRequest } from "@/lib/cron-auth";

export async function POST(request:Request){
  if(!await validCronRequest(request))return jsonError("Unauthorized",401);
  const posts=await prisma.facebookPost.findMany({where:{status:"scheduled",scheduledAt:{lte:new Date()}},take:50});let published=0;
  for(const post of posts){
    const rule=await prisma.automationRule.findFirst({where:{channel:"facebook_post",actions:{path:["postId"],equals:post.id}},select:{id:true,userId:true,name:true}});
    try{const result=await facebookRequest<{id:string}>(post.pageId,"/me/feed","POST",{message:post.content});await prisma.facebookPost.update({where:{id:post.id},data:{externalId:result.id,status:"published",publishedAt:new Date()}});if(rule){await prisma.automationRule.update({where:{id:rule.id},data:{lastTriggeredAt:new Date(),isActive:false}});await notifyUser({userId:rule.userId,type:"automation_complete",title:`Post published: ${rule.name}`,body:post.content.slice(0,180),metadata:{href:"/facebook",automationId:rule.id,postId:post.id}})}published++}
    catch(error){await prisma.facebookPost.update({where:{id:post.id},data:{status:"failed"}});if(rule)await notifyUser({userId:rule.userId,type:"automation_failed",title:`Publishing failed: ${rule.name}`,body:error instanceof Error?error.message:"Facebook rejected the post.",metadata:{href:"/automation",automationId:rule.id}})}
  }
  return Response.json({processed:posts.length,published});
}

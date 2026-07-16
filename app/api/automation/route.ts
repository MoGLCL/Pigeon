import { prisma } from "@/lib/prisma";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { automationSchema } from "@/lib/validators/features.schema";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(){const guard=await requireUser();if("error"in guard)return guard.error;return Response.json(await prisma.automationRule.findMany({where:{userId:guard.user.id},include:{fbPage:{select:{name:true,avatarUrl:true}},waAccount:{select:{sessionName:true,displayName:true,avatarUrl:true}}},orderBy:{createdAt:"desc"}}));}

export async function POST(request:Request){
  if(!sameOrigin(request))return jsonError("Invalid origin",403);
  const guard=await requireUser();if("error"in guard)return guard.error;
  const parsed=automationSchema.safeParse(await parseJson(request));if(!parsed.success)return jsonError("Invalid automation",422,parsed.error.flatten());
  const owns=parsed.data.channel==="whatsapp"?await prisma.whatsAppAccount.count({where:{id:parsed.data.waAccountId,ownerId:guard.user.id}}):await prisma.facebookPage.count({where:{id:parsed.data.fbPageId,ownerId:guard.user.id}});
  if(!owns)return jsonError("Connected account not found",404);
  if(parsed.data.channel==="facebook_post"){
    const scheduledAt=z.coerce.date().safeParse(parsed.data.actions?.scheduledAt);
    if(!scheduledAt.success||scheduledAt.data<=new Date())return jsonError("Choose a future publishing time",422);
    return Response.json(await prisma.$transaction(async tx=>{
      const rule=await tx.automationRule.create({data:{...parsed.data,userId:guard.user.id,actions:{scheduledAt:scheduledAt.data.toISOString()}}});
      const post=await tx.facebookPost.create({data:{pageId:parsed.data.fbPageId!,content:parsed.data.replyMessage,mediaUrls:[],status:"scheduled",scheduledAt:scheduledAt.data}});
      return tx.automationRule.update({where:{id:rule.id},data:{actions:{scheduledAt:scheduledAt.data.toISOString(),postId:post.id}}});
    }),{status:201});
  }
  return Response.json(await prisma.automationRule.create({data:{...parsed.data,userId:guard.user.id,actions:parsed.data.actions as Prisma.InputJsonValue|undefined}}),{status:201});
}

export async function PATCH(request:Request){if(!sameOrigin(request))return jsonError("Invalid origin",403);const guard=await requireUser();if("error"in guard)return guard.error;const parsed=z.object({id:z.string().uuid(),isActive:z.boolean()}).safeParse(await parseJson(request));if(!parsed.success)return jsonError("Invalid automation update",422);const rule=await prisma.automationRule.findFirst({where:{id:parsed.data.id,userId:guard.user.id},select:{id:true,channel:true,actions:true}});if(!rule)return jsonError("Automation not found",404);const postId=typeof rule.actions==="object"&&rule.actions&&"postId"in rule.actions?String((rule.actions as Record<string,unknown>).postId):null;await prisma.$transaction([prisma.automationRule.update({where:{id:rule.id},data:{isActive:parsed.data.isActive}}),...(rule.channel==="facebook_post"&&postId?[prisma.facebookPost.updateMany({where:{id:postId,status:{in:["scheduled","draft"]}},data:{status:parsed.data.isActive?"scheduled":"draft"}})]:[])]);return Response.json({ok:true});}
export async function DELETE(request:Request){if(!sameOrigin(request))return jsonError("Invalid origin",403);const guard=await requireUser();if("error"in guard)return guard.error;const parsed=z.object({id:z.string().uuid()}).safeParse(await parseJson(request));if(!parsed.success)return jsonError("Invalid automation",422);const rule=await prisma.automationRule.findFirst({where:{id:parsed.data.id,userId:guard.user.id},select:{id:true,actions:true}});if(!rule)return jsonError("Automation not found",404);const postId=typeof rule.actions==="object"&&rule.actions&&"postId"in rule.actions?String((rule.actions as Record<string,unknown>).postId):null;await prisma.$transaction([...(postId?[prisma.facebookPost.deleteMany({where:{id:postId,status:"scheduled"}})]:[]),prisma.automationRule.delete({where:{id:rule.id}})]);return Response.json({ok:true});}

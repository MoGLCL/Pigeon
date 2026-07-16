import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError,parseJson,requireUser,sameOrigin } from "@/lib/api";
import { canAssignRole,canChangeStatus } from "@/lib/rbac";
import type { AccountStatus,Role } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";

const updateSchema=z.object({userId:z.string().uuid(),name:z.string().trim().min(2).max(120).optional(),username:z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/).optional(),email:z.string().trim().email().max(254).optional(),role:z.enum(["owner","admin","moderator","user"]).optional(),status:z.enum(["active","suspended","banned"]).optional(),forcePasswordReset:z.boolean().optional(),newPassword:z.string().min(10).max(128).optional()}).refine(v=>v.name||v.username||v.email||v.role||v.status||v.forcePasswordReset!==undefined||v.newPassword);

export async function GET(){
  const guard=await requireUser(["owner","admin"]);if("error"in guard)return guard.error;
  const where=guard.user.role==="owner"?{}:{role:"user" as Role};
  return Response.json(await prisma.user.findMany({where,select:{id:true,name:true,username:true,email:true,role:true,status:true,lastLoginAt:true,createdAt:true,forcePasswordReset:true},orderBy:{createdAt:"desc"}}));
}

export async function PATCH(request:Request){
  if(!sameOrigin(request))return jsonError("Invalid origin",403);
  const guard=await requireUser(["owner","admin"]);if("error"in guard)return guard.error;
  const parsed=updateSchema.safeParse(await parseJson(request));if(!parsed.success)return jsonError("Invalid user update",422,parsed.error.flatten());
  const target=await prisma.user.findUnique({where:{id:parsed.data.userId}});if(!target)return jsonError("User not found",404);
  if(target.id===guard.user.id&&(parsed.data.role||parsed.data.status))return jsonError("Cannot change your own role or status",403);
  if(guard.user.role==="admin"&&target.role!=="user")return jsonError("Admins can only manage user accounts",403);
  if(parsed.data.role&&!canAssignRole(guard.user.role as Role,parsed.data.role as Role))return jsonError("Role assignment denied",403);
  if(parsed.data.status&&!canChangeStatus(guard.user.role as Role,target.role))return jsonError("Status change denied",403);
  if(parsed.data.username||parsed.data.email){const conflict=await prisma.user.findFirst({where:{id:{not:target.id},OR:[...(parsed.data.username?[{username:parsed.data.username}]:[]),...(parsed.data.email?[{email:parsed.data.email}]:[])]},select:{username:true,email:true}});if(conflict)return jsonError(conflict.email===parsed.data.email?"Email is already in use":"Username is already in use",409)}
  const before={name:target.name,username:target.username,email:target.email,role:target.role,status:target.status,forcePasswordReset:target.forcePasswordReset};
  const user=await prisma.user.update({where:{id:target.id},data:{name:parsed.data.name,username:parsed.data.username,email:parsed.data.email,role:parsed.data.role as Role|undefined,status:parsed.data.status as AccountStatus|undefined,forcePasswordReset:parsed.data.forcePasswordReset,passwordHash:parsed.data.newPassword?await hash(parsed.data.newPassword,12):undefined},select:{id:true,name:true,username:true,email:true,role:true,status:true,forcePasswordReset:true}});
  const identityChanged=Boolean(parsed.data.name||parsed.data.username||parsed.data.email);
  await writeAuditLog(guard.user.id,parsed.data.newPassword?"password.admin_reset":identityChanged?"account.identity":parsed.data.role?"role.change":parsed.data.status?"account.status":"password.force_reset",{before,after:user},target.id);
  if(parsed.data.status&&parsed.data.status!=="active"||parsed.data.newPassword)await prisma.userSession.deleteMany({where:{userId:target.id}});
  return Response.json(user);
}

export async function DELETE(request:Request){
  if(!sameOrigin(request))return jsonError("Invalid origin",403);
  const guard=await requireUser(["owner","admin"]);if("error"in guard)return guard.error;
  const parsed=z.object({userId:z.string().uuid()}).safeParse(await parseJson(request));if(!parsed.success)return jsonError("Invalid user",422);
  const target=await prisma.user.findUnique({where:{id:parsed.data.userId}});if(!target)return jsonError("User not found",404);
  if(target.id===guard.user.id||target.role==="owner"||guard.user.role==="admin"&&target.role!=="user")return jsonError("Deletion denied",403);
  const [fbPages,waAccounts,broadcasts,contacts,reports]=await Promise.all([
    prisma.facebookPage.findMany({where:{ownerId:target.id},select:{id:true}}),
    prisma.whatsAppAccount.findMany({where:{ownerId:target.id},select:{id:true}}),
    prisma.broadcast.findMany({where:{userId:target.id},select:{id:true}}),
    prisma.contact.findMany({where:{userId:target.id},select:{id:true}}),
    prisma.report.findMany({where:{userId:target.id},select:{id:true}}),
  ]);
  const fbIds=fbPages.map(item=>item.id),waIds=waAccounts.map(item=>item.id);
  const [fbConversations,waConversations]=await Promise.all([
    prisma.facebookConversation.findMany({where:{pageId:{in:fbIds}},select:{id:true}}),
    prisma.whatsAppConversation.findMany({where:{accountId:{in:waIds}},select:{id:true}}),
  ]);
  const fbConversationIds=fbConversations.map(item=>item.id),waConversationIds=waConversations.map(item=>item.id),broadcastIds=broadcasts.map(item=>item.id),contactIds=contacts.map(item=>item.id),reportIds=reports.map(item=>item.id);
  await prisma.$transaction([
    prisma.facebookMessage.deleteMany({where:{conversationId:{in:fbConversationIds}}}),
    prisma.facebookConversation.deleteMany({where:{pageId:{in:fbIds}}}),
    prisma.facebookPost.deleteMany({where:{pageId:{in:fbIds}}}),
    prisma.facebookComment.deleteMany({where:{pageId:{in:fbIds}}}),
    prisma.facebookActivity.deleteMany({where:{pageId:{in:fbIds}}}),
    prisma.whatsAppMessage.deleteMany({where:{conversationId:{in:waConversationIds}}}),
    prisma.whatsAppConversation.deleteMany({where:{accountId:{in:waIds}}}),
    prisma.automationRule.deleteMany({where:{userId:target.id}}),
    prisma.broadcastRecipient.deleteMany({where:{broadcastId:{in:broadcastIds}}}),
    prisma.broadcast.deleteMany({where:{userId:target.id}}),
    prisma.contactTag.deleteMany({where:{contactId:{in:contactIds}}}),
    prisma.contact.deleteMany({where:{userId:target.id}}),
    prisma.reportReply.deleteMany({where:{OR:[{userId:target.id},{reportId:{in:reportIds}}]}}),
    prisma.report.deleteMany({where:{userId:target.id}}),
    prisma.auditLog.deleteMany({where:{OR:[{actorId:target.id},{targetId:target.id}]}}),
    prisma.facebookPage.deleteMany({where:{ownerId:target.id}}),
    prisma.whatsAppAccount.deleteMany({where:{ownerId:target.id}}),
    prisma.user.delete({where:{id:target.id}}),
  ]);
  await writeAuditLog(guard.user.id,"account.delete",{deletedUserId:target.id,email:target.email,role:target.role});
  return Response.json({ok:true});
}

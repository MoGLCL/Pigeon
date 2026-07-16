import { prisma } from "@/lib/prisma";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { replySchema } from "@/lib/validators/report.schema";
import { idSchema } from "@/lib/validators/common";
import { notifyUser } from "@/lib/notifications";
import { canReplyToReport, replyStatus } from "@/lib/support";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!sameOrigin(request))return jsonError("Invalid origin",403);
  const guard=await requireUser();if("error"in guard)return guard.error;
  const id=idSchema.safeParse((await params).id),body=replySchema.safeParse(await parseJson(request));
  if(!id.success||!body.success)return jsonError("Invalid reply",422);
  const report=await prisma.report.findUnique({where:{id:id.data},select:{id:true,userId:true,subject:true,status:true}});
  if(!report)return jsonError("Report not found",404);
  const staff=["owner","admin","moderator"].includes(guard.user.role);
  if(!canReplyToReport({role:guard.user.role,userId:guard.user.id,reportOwnerId:report.userId??""}))return jsonError("Forbidden",403);
  if(report.status==="closed")return jsonError("This ticket is closed. Reopen it before adding another reply.",409);
  const nextStatus=replyStatus({role:guard.user.role,currentStatus:report.status});
  const reply=await prisma.$transaction(async tx=>{const item=await tx.reportReply.create({data:{reportId:report.id,userId:guard.user.id,body:body.data.body}});if(nextStatus!==report.status)await tx.report.update({where:{id:report.id},data:{status:nextStatus}});return item});
  if(staff&&report.userId)await notifyUser({userId:report.userId,type:"support_reply",title:`New reply: ${report.subject}`,body:body.data.body.slice(0,180),metadata:{href:`/reports?ticket=${report.id}`,reportId:report.id}});
  else {const staffUsers=await prisma.user.findMany({where:{role:{in:["owner","admin","moderator"]},status:"active"},select:{id:true}});await Promise.all(staffUsers.map(user=>notifyUser({userId:user.id,type:"support_user_reply",title:`Customer replied: ${report.subject}`,body:body.data.body.slice(0,180),metadata:{href:`/admin/reports?ticket=${report.id}`,reportId:report.id}})))}
  return Response.json(reply,{status:201});
}

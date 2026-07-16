import { createHash,randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { jsonError,parseJson,sameOrigin } from "@/lib/api";
import { reportSchema } from "@/lib/validators/report.schema";
import { clientIp,rateLimit } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/notifications";
const hashToken=(token:string)=>createHash("sha256").update(token).digest("hex");
export async function POST(request:Request){if(!sameOrigin(request))return jsonError("Invalid origin",403);const ip=clientIp(request);if(!rateLimit(`public-support:${ip}`,3,60_000).allowed)return jsonError("Please wait before sending another request",429);const parsed=reportSchema.safeParse(await parseJson(request));if(!parsed.success)return jsonError("Check the support request details",422,parsed.error.flatten());const token=randomBytes(32).toString("base64url");const report=await prisma.report.create({data:{...parsed.data,guestTokenHash:hashToken(token)}});const staff=await prisma.user.findMany({where:{role:{in:["owner","admin","moderator"]},status:"active"},select:{id:true}});await Promise.all(staff.map(user=>notifyUser({userId:user.id,type:"support_ticket",title:`External support: ${report.subject}`,body:report.body.slice(0,180),metadata:{href:`/admin/reports?ticket=${report.id}`,reportId:report.id}})));return Response.json({ok:true,reference:report.id.slice(0,8).toUpperCase(),token},{status:201})}

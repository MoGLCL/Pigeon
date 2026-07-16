import { z } from "zod";
const safeText=(min:number,max:number)=>z.string().trim().min(min).max(max).refine(v=>!/<[^>]+>/.test(v),"HTML is not allowed");
export const reportSchema = z.object({contactName:safeText(2,120),contactEmail:z.string().trim().email().max(254),severity:z.enum(["low","normal","high","risk"]),subject:safeText(4,140),body:safeText(10,5000)});
export const replySchema = z.object({ body: z.string().trim().min(2).max(5000).refine(v => !/<[^>]+>/.test(v), "HTML is not allowed") });
export const reportStatusSchema = z.object({ status: z.enum(["open", "in_review", "resolved", "closed"]) });

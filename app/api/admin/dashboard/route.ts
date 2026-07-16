import{prisma}from"@/lib/prisma";import{requireUser}from"@/lib/api";
const DAY=86400000;
export async function GET(){
  const guard=await requireUser(["owner","admin"]);if("error"in guard)return guard.error;
  const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-13);const today=new Date(now);today.setHours(0,0,0,0);
  const[usersByStatus,registrations,visits,fb,wa,reportsBySeverity,openReports,facebookConnections,whatsappConnections,recentUsers]=await Promise.all([
    prisma.user.groupBy({by:["status"],_count:{_all:true}}),
    prisma.user.findMany({where:{createdAt:{gte:start}},select:{createdAt:true}}),
    prisma.siteVisit.findMany({where:{visitedAt:{gte:start}},select:{visitorId:true,visitedAt:true}}),
    prisma.facebookMessage.findMany({where:{sentAt:{gte:start}},select:{fromPage:true,sentAt:true}}),
    prisma.whatsAppMessage.findMany({where:{sentAt:{gte:start}},select:{fromMe:true,sentAt:true}}),
    prisma.report.groupBy({by:["severity"],_count:{_all:true},where:{status:{in:["open","in_review"]}}}),
    prisma.report.count({where:{status:{in:["open","in_review"]}}}),
    prisma.facebookPage.count({where:{status:"connected"}}),
    prisma.whatsAppAccount.count({where:{status:"connected"}}),
    prisma.user.findMany({orderBy:{createdAt:"desc"},take:6,select:{id:true,name:true,username:true,email:true,role:true,status:true,createdAt:true}})
  ]);
  const statusCounts=Object.fromEntries(usersByStatus.map(row=>[row.status,row._count._all]))as Record<string,number>,users=Object.values(statusCounts).reduce((sum,value)=>sum+value,0);
  const days=Array.from({length:14},(_,index)=>{const date=new Date(start.getTime()+index*DAY);return{key:date.toISOString().slice(0,10),label:date.toLocaleDateString("en",{month:"short",day:"numeric"}),visitors:new Set<string>(),registrations:0,messages:0}});
  const byKey=new Map(days.map(day=>[day.key,day]));for(const visit of visits)byKey.get(visit.visitedAt.toISOString().slice(0,10))?.visitors.add(visit.visitorId);for(const user of registrations){const day=byKey.get(user.createdAt.toISOString().slice(0,10));if(day)day.registrations++}for(const message of[...fb,...wa]){const day=byKey.get(message.sentAt.toISOString().slice(0,10));if(day)day.messages++}
  const uniqueVisitors=new Set(visits.map(visit=>visit.visitorId)).size,received=fb.filter(message=>!message.fromPage).length+wa.filter(message=>!message.fromMe).length,sent=fb.filter(message=>message.fromPage).length+wa.filter(message=>message.fromMe).length,severity=Object.fromEntries(reportsBySeverity.map(row=>[row.severity,row._count._all]));
  return Response.json({stats:{visitors:uniqueVisitors,visitorsToday:new Set(visits.filter(visit=>visit.visitedAt>=today).map(visit=>visit.visitorId)).size,registrations:registrations.length,conversionRate:uniqueVisitors?Math.round(registrations.length/uniqueVisitors*1000)/10:0,users,activeUsers:statusCounts.active??0,suspendedUsers:(statusCounts.suspended??0)+(statusCounts.banned??0),messages:fb.length+wa.length,received,sent,openReports,riskReports:severity.risk??0,connectedChannels:facebookConnections+whatsappConnections},series:days.map(({visitors,...day})=>({...day,visitors:visitors.size})),support:{severity},recentUsers});
}

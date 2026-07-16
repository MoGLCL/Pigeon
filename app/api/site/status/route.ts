import{prisma}from"@/lib/prisma";
export async function GET(){const rows=await prisma.setting.findMany({where:{key:{in:["site_name","site_logo_url","site_brand_display","site_mode","registration_open"]}}});return Response.json(Object.fromEntries(rows.map(x=>[x.key,x.value])))}

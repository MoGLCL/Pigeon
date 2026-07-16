import{AdminFrame}from"@/components/admin/AdminFrame";import{ReportManager}from"@/components/reports/ReportManager";import{guardPage}from"@/lib/page-auth";
export default async function Page(){await guardPage("/admin/reports");return <AdminFrame><ReportManager/></AdminFrame>}

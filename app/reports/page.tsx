import{AppFrame}from"@/components/layout/AppFrame";import{ReportManager}from"@/components/reports/ReportManager";import{guardPage}from"@/lib/page-auth";
export default async function Page(){await guardPage("/reports");return <AppFrame><ReportManager/></AppFrame>}

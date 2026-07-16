import{AdminFrame}from"@/components/admin/AdminFrame";import{UserManager}from"@/components/admin/UserManager";import{guardPage}from"@/lib/page-auth";
export default async function Page(){await guardPage("/admin/users");return <AdminFrame><UserManager/></AdminFrame>}

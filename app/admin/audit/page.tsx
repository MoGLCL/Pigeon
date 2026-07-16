import{AppFrame}from"@/components/layout/AppFrame";import{ResourcePage}from"@/components/workspace/ResourcePage";
export default function Page(){return <AppFrame><ResourcePage title="Audit log" description="Immutable history of sensitive administrative actions." endpoint="/api/admin/audit" columns={["Action","Created"]}/></AppFrame>}

import{guardPage}from"@/lib/page-auth";export default async function Layout({children}:{children:React.ReactNode}){await guardPage("/broadcast");return children}

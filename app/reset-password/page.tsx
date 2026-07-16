import{ResetPasswordForm}from"@/components/auth/ResetPasswordForm";import{guardPage}from"@/lib/page-auth";
export default async function Page(){await guardPage("/reset-password");return <main className="auth-page"><section className="auth-card"><h1>Set a new password</h1><p>Your administrator requires a password reset before continuing.</p><ResetPasswordForm/></section></main>}

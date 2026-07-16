import { z } from "zod";
export const loginSchema = z.object({ email: z.string().trim().min(3).max(120).transform(v => v.toLowerCase()), password: z.string().min(8).max(128) });
export const registrationSchema = z.object({ name: z.string().trim().min(2).max(80), username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/), email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/) }).strict();
export const passwordResetSchema = z.object({ password: z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/) });
export const forgotPasswordSchema = z.object({ email: z.string().email().transform(v => v.toLowerCase()) });
export const resetByTokenSchema = z.object({ password: z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/) });

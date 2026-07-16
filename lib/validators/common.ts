import { z } from "zod";
export const paginationSchema = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
export const idSchema = z.string().uuid();

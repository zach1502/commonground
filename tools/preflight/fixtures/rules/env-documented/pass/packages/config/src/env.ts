import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  AUTH_PROVIDER: z.enum(['mock']).default('mock'),
});

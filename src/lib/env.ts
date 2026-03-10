/**
 * Validates all required environment variables at module load time.
 * If any variable is missing the app fails loudly — far better than a
 * silent `undefined` surfacing at runtime deep inside a request.
 *
 * Import this file in any server-side module that needs env vars, or
 * import it once in the root layout to trigger the check on every cold start.
 *
 * ⚠️  Server-only — never import from a Client Component.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
});

const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌  Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  throw new Error(
    '❌  Invalid environment variables. Fix the issues above before starting the app.'
  );
}

export const env = result.data;

import { z } from 'zod';

/**
 * Env vars every service understands. Services extend this with their own
 * requirements via `baseEnvSchema.extend({...})` — the shared lib owns the
 * mechanism, each service owns its required variables.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().optional(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/**
 * Builds a validate function for NestJS ConfigModule.forRoot({ validate }).
 * Throws at bootstrap with every missing/invalid variable listed — the
 * service must fail at startup, not at first use of a missing variable.
 */
export function createEnvValidator<S extends z.ZodTypeAny>(schema: S) {
  return (config: Record<string, unknown>): z.infer<S> => {
    const result = schema.safeParse(config);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      throw new Error(`Environment validation failed:\n${issues}`);
    }
    return result.data;
  };
}

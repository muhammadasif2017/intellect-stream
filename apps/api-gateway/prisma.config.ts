import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7: CLI configuration lives here, not in schema.prisma.
// The schema stays service-owned (DB-per-service); this file just points at it.
// Separate from the root prisma.config.ts (content-service's) — each service
// with its own database gets its own config, invoked via `prisma --config`.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('GATEWAY_DATABASE_URL'),
  },
});

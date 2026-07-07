import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7: CLI configuration lives here, not in schema.prisma.
// The schema stays service-owned (DB-per-service); this file just points at it.
export default defineConfig({
  schema: 'apps/content-service/prisma/schema.prisma',
  migrations: {
    path: 'apps/content-service/prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});

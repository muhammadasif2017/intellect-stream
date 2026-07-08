-- Decision 4 (DB-per-service): API Gateway gets its own database on the
-- same Postgres container as content_db — one instance, separate
-- databases, logical isolation (ADR-0004's accepted dev-mode pattern).
-- Only runs on first container init (empty data volume). For an
-- already-initialized volume, apply this manually instead.
-- CREATEDB: Prisma Migrate needs it to create/drop its shadow database
-- during `migrate dev` (https://pris.ly/d/migrate-shadow).
CREATE USER gateway_user WITH PASSWORD 'gateway_pass' CREATEDB;
CREATE DATABASE gateway_db OWNER gateway_user;

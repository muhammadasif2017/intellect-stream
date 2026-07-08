#!/bin/bash
# Decision 4 (DB-per-service): API Gateway gets its own database on the
# same Postgres container as content_db — one instance, separate
# databases, logical isolation (ADR-0004's accepted dev-mode pattern).
# Only runs on first container init (empty data volume). For an
# already-initialized volume, apply this manually instead.
#
# .sh (not .sql) so docker-entrypoint-initdb.d executes it with the
# container's env available for substitution — credentials come from
# GATEWAY_DB_* env vars (see .env), not hardcoded here.
set -e

# CREATEDB: Prisma Migrate needs it to create/drop its shadow database
# during `migrate dev` (https://pris.ly/d/migrate-shadow).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER ${GATEWAY_DB_USER} WITH PASSWORD '${GATEWAY_DB_PASSWORD}' CREATEDB;
  CREATE DATABASE ${GATEWAY_DB_NAME} OWNER ${GATEWAY_DB_USER};
EOSQL

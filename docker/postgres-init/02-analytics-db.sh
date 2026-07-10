#!/bin/bash
# ADR-0004 (DB-per-service) / ADR-0010: Analytics Service gets its own
# database on the same Postgres container as content_db/gateway_db — one
# instance, separate databases, logical isolation. Only runs on first
# container init (empty data volume). For an already-initialized volume,
# apply this manually instead.
set -e

# CREATEDB: Prisma Migrate needs it to create/drop its shadow database
# during `migrate dev` (https://pris.ly/d/migrate-shadow).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER ${ANALYTICS_DB_USER} WITH PASSWORD '${ANALYTICS_DB_PASSWORD}' CREATEDB;
  CREATE DATABASE ${ANALYTICS_DB_NAME} OWNER ${ANALYTICS_DB_USER};
EOSQL

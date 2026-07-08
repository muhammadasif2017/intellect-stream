# BUG-0004: `P1001: Can't reach database server` despite containers "running"

**Found:** 2026-07-08, running `pnpm db:migrate` for the Post model
**Status:** Resolved (environmental, not a code fix)

## Symptom

```
Error: P1001: Can't reach database server at `localhost:5432`
Please make sure your database server is running at `localhost:5432`.
```

`docker compose ps` showed all four containers as `Up 19 hours (Paused)`.

## Root cause

Docker Desktop had paused the containers (not stopped — paused, i.e. frozen
process state, ports still bound but not servicing connections). Not a
project config issue; `docker-compose.yml` health checks were passing before
the pause.

## Fix

```
docker compose unpause
```

Confirmed with `docker exec intellect-stream-postgres pg_isready -U content_user -d content_db`.

## Prevention

Not a code bug — noted here because the error message (`P1001`,
"make sure your database server is running") points at the wrong mental
model (stopped vs. paused) and cost time checking `docker-compose.yml`/env
vars before checking container state directly. If this recurs, check
`docker compose ps` state column first, before touching config.

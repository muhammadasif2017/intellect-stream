# ADR-0008: Fixed-window Redis rate limit, keyed by IP

## Status
Accepted

## Date
2026-07-08

## Context
Milestone 4 (API Gateway) needs the rate-limit half of "Redis rate-limit + session" from SPEC's tech stack. SPEC provisions one Redis instance for both roles (Decision 15 / ADR-0007 already uses it for sessions); rate-limiting reuses the same connection rather than opening a second one. Requirement is simple abuse protection at the edge, applied globally via `APP_GUARD`, not per-route tuning.

## Decision
Fixed-window counter in Redis, one key per client IP:

- Key: `ratelimit:<ip>`, value = request count in the current window.
- `INCR` on every request (atomic); the request that takes the counter to 1 sets `PEXPIRE` for the window (`WINDOW_MS = 60_000`).
- Limit: `MAX_REQUESTS = 100` per window. Over limit → `429 Too Many Requests`.
- `X-RateLimit-Limit` / `X-RateLimit-Remaining` set on every response.
- Wired as a global `APP_GUARD` (`RateLimitGuard`), so it runs ahead of route handlers for all endpoints.
- Shares the single `REDIS_CLIENT` provider (`RedisModule`) with the session store — one Redis connection for the whole app, not one per concern.

## Alternatives Considered

### Sliding-window log (sorted set of timestamps)
- Pros: no burst-at-window-boundary problem — smooths the limit continuously.
- Cons: one Redis key per request timestamp (ZADD + ZREMRANGEBYSCORE + ZCARD per check) instead of a single INCR; more Redis ops per request for a bound this milestone doesn't need.
- Rejected: fixed window's known weakness (up to 2x burst across a boundary, e.g. max requests at 0:59 and again at 1:00) is acceptable for a learning-scale gateway; sliding window is the upgrade path if abuse patterns ever demand it.

### Token bucket (via `rate-limiter-flexible` or similar library)
- Pros: smooth refill, well-tested library, handles the boundary-burst problem too.
- Cons: another dependency and its own config surface for a single global limit; hand-rolled INCR+PEXPIRE is ~30 lines and keeps the mechanism visible.
- Rejected: not enough requirement complexity yet to justify the library; revisit if per-route or per-user limits are needed.

### In-memory counter (no Redis)
- Pros: zero network round-trip, simplest possible code.
- Cons: doesn't survive gateway restarts, and breaks entirely once the gateway runs as more than one instance (each instance has its own counter — effective limit multiplies by instance count). Also ignores the Redis slot SPEC already provisions for this exact purpose.
- Rejected: fails the moment there's more than one gateway process.

## Consequences
- Rate-limit state lives in Redis, so it's correct across gateway restarts and (unlike an in-memory counter) shared correctly across multiple gateway instances — same store, same key.
- Known gap: the guard is IP-keyed only, not IP+route or IP+user — a single hot endpoint and a quiet one consume the same budget. Acceptable for a global first pass; per-route limits are a follow-up if needed.
- Known race: a crash between `INCR` and `PEXPIRE` leaves a key with no TTL (never expires until overwritten by count resetting elsewhere). Narrow window, low-stakes failure mode (stuck-open limit key, not a security hole) — not fixed now.
- Not multi-instance-safe against clock/expiry drift in fancier ways (e.g. two instances racing the first INCR of a window) — plain `INCR`+conditional `PEXPIRE` is safe for the count itself (INCR is atomic) but the two ops aren't wrapped in a transaction. Acceptable at this scale.

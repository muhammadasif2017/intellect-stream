# ADR-0007: Session-cookie auth at the edge, gateway-signed tokens downstream

## Status
Accepted

## Date
2026-07-08

## Context
Milestone 4 (API Gateway) needs an auth strategy, open since SPEC's initial draft. Three sub-decisions bundle together: how the client authenticates to the gateway, who issues identity, and how downstream services (content-service, and later ai-processing/analytics/notification) trust the gateway's claim about who the user is. SPEC already provisions Redis for "rate-limiting, session tracking, caching" — the stack anticipates a session-based model, not a bare-JWT one.

## Decision
Two-tier auth:

1. **Client ↔ gateway**: session-cookie, backed by Redis. Gateway authenticates the request, looks up the session in Redis.
2. **Gateway → downstream services**: the gateway mints a short-lived, signed token (shared-secret JWT: `{ userId, exp }`) per outbound request, attached as a header. Downstream services verify the signature independently — no implicit trust from network position alone.

"Who issues identity" (registration/login/password storage) is a separate, still-open question (SPEC's user identity model item) — this ADR only fixes the *transport and trust* shape, not where the identity source of truth lives.

## Alternatives Considered

### Client-held JWT end-to-end
- Pros: stateless, no server-side session store, downstream services could theoretically verify the same token directly.
- Cons: revocation requires a blocklist or short expiry + refresh-token rotation — real complexity for a learning-scale system. Doesn't use the Redis slot already provisioned in SPEC's tech stack. Rejected: more moving parts for no benefit at this scale, and ignores a design signal already present in the spec.

### Forwarded trusted header (`X-User-Id`), no signature
- Pros: simplest possible downstream trust — gateway sets a header, services read it.
- Cons: any service (or anything) that can reach content-service directly can spoof the header. Trust is entirely implicit in network topology, not verifiable. Weaker boundary, and a weaker interview story ("we trusted the network" vs "we verify a signature").
- Rejected: the signed-token cost is small (one shared secret, one verify call) for a meaningfully stronger boundary.

## Consequences
- Redis now serves two roles for API Gateway: rate-limiting and session storage (already anticipated in SPEC's Tech Stack list).
- Downstream services need a shared secret (or public key, if moving to asymmetric signing later) to verify the gateway-minted token — this becomes a new piece of shared config, likely belonging in `shared-config` alongside the existing env-validation pattern.
- Internal tokens are minted per-request, not stored — no internal session state, only the edge session in Redis needs invalidation logic (logout, expiry).
- Still open: where user identity itself lives (users module in gateway vs dedicated identity service) — SPEC's user identity model question, unresolved by this ADR.

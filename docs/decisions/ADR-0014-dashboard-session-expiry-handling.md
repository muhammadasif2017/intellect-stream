# ADR-0014: Dashboard session-expiry handling — global 401 eviction to login, cache purge deferred to next login

## Status
Accepted

## Date
2026-07-12

## Context
Auth is a server-side session cookie at the gateway (ADR-0007) — there is no
refresh token, so the only recovery from an expired session is logging in
again. The dashboard cached the logged-in user with `staleTime: Infinity`
(`useMe`), so when the cookie expired the `me` cache still said "logged in":
AuthGate never flipped back to the login screen, every other query 401ed
into an ErrorState, and the user was stranded — the only escape was a hard
refresh. No global 401 handling existed anywhere in the frontend.

## Decision
**1. Global 401 interception in the query client** (`lib/query.tsx`).
`QueryCache` and `MutationCache` `onError` handlers catch any `ApiError`
with status 401 and set the `me` cache to `null`. AuthGate already renders
the login screen when `me` is null, so session expiry now lands the user on
the login form instead of a dead error page. The `me` query itself is
excluded — it maps 401 → null internally because anonymous is a data state
there, not an error.

**2. Eviction does NOT purge the rest of the cache.** The first design
called `removeQueries` inside the 401 handler, mirroring logout. Tests
exposed a request loop: removing a query that still has a mounted observer
makes React Query re-create and refetch it immediately, which 401s again →
remove → refetch, hammering the gateway until AuthGate unmounts the page
(21 requests in the test run). Eviction therefore only flips `me`; the
mounted pages unmount on the next render and their queries go quiet.

**3. The dead session's cache is purged on the next login instead.**
`useLogin`/`useRegister` success now runs `enterSession`: set `me`, then
`removeQueries` for everything else (the same cleanup `useLogout` does).
At that moment the login screen is the only thing mounted, so removal
cannot trigger the refetch loop, and a fresh login — including a different
account — never sees the previous session's data.

**4. 401s are never retried.** The query client's retry policy short-circuits
on `ApiError` 401 (an expired session stays expired; retrying only delays
the redirect) and keeps the existing single retry for everything else.

## Alternatives considered
- **Refresh tokens / silent re-auth**: would remove the interruption
  entirely, but it's a gateway auth-model change (ADR-0007 territory), not
  a frontend fix. The dashboard is a dev tool; re-login is acceptable.
- **Purge cache at eviction time**: rejected — the observer refetch loop
  above. This is the non-obvious trap in this ADR; see the comment on
  `evictExpiredSession` in `lib/query.tsx`.
- **Per-page 401 handling**: every page checking `error.status === 401` and
  redirecting — repeated logic, easy to forget on new pages. Session expiry
  is an app-boundary concern, same reasoning that put AuthGate around the
  whole app.
- **Rolling sessions on the gateway** (`rolling: true`): complementary, not
  an alternative — it reduces how often active users expire but cannot
  eliminate expiry. Deferred as a separate gateway decision.

## Consequences
- Session expiry now degrades to the login screen; after re-login the cache
  is clean and pages refetch on mount.
- SSE (`use-sse`) and the notifications WebSocket bypass `apiFetch`, so a
  session dying mid-stream still just drops the stream silently — the next
  REST call triggers the redirect. Accepted gap for now.
- Anything keyed `['me']` is load-bearing in three places (use-auth,
  lib/query eviction, logout predicate); the literal is duplicated in
  lib/query.tsx deliberately because lib/ must not import from features/.

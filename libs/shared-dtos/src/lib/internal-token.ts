// Audience claim for gateway-minted internal JWTs (ADR-0007). Scoping by
// `aud` stops a token minted for one purpose (e.g. the WS handshake ticket,
// which the client holds directly) from being replayed against a different
// verifier (e.g. a downstream service's REST API).
export const INTERNAL_TOKEN_AUDIENCE = {
  API: 'internal-api',
  NOTIFICATIONS_WS: 'notifications-ws',
} as const;

export type InternalTokenAudience =
  (typeof INTERNAL_TOKEN_AUDIENCE)[keyof typeof INTERNAL_TOKEN_AUDIENCE];

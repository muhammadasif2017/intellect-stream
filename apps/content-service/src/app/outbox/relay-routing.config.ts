// Decision 14: routing is a relay-config concern (eventType -> destination),
// not a column on the outbox row — one event can fan out to multiple
// destinations later without minting duplicate outbox rows.
export const RELAY_ROUTING: Record<string, string> = {
  'moderation.job': 'moderation.job',
};

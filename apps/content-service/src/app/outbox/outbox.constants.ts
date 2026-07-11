// BUG-0006: rows that fail this many times stop competing for batch slots.
// They stay in the table (decision 14: never silent-drop) — manual replay is
// resetting attempts, same log-and-alert posture as decision 10's DLQ.
// Shared with the dev stats endpoint, which counts rows at this threshold
// as quarantined.
export const OUTBOX_MAX_ATTEMPTS = 10;

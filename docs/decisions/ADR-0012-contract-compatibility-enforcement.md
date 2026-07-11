# ADR-0012: Contract compatibility enforcement — frozen fixtures in CI, version check at consumer boundaries

## Status
Accepted

## Date
2026-07-11

## Context
Decision 9 declared `shared-dtos` changes must be additive-only (no breaking
field changes) so producers and consumers never need a lockstep deploy, and
decision 13's envelope carries `eventVersion` for the day a breaking change
is unavoidable. Both were honor-system: nothing failed CI when a field was
renamed or made required, and no consumer ever read `eventVersion` — an
incompatible event would surface as a confusing class-validator error (or a
silent misparse) deep inside a handler, not as a contract violation.

The 2026-07-11 architecture review flagged this as the gap most likely to
bite when a second contributor (or a hurried future self) touches
`shared-dtos`: the rule exists only in prose.

## Decision
Two mechanisms, both small, no new infra:

**1. Frozen golden fixtures in `shared-dtos`
(`contract-compatibility.spec.ts`).** Real v1 wire payloads, copied into the
spec and frozen — including historical shapes (e.g. `moderation.completed`
without `authorId`, the pre-decision-22 form still emitted by AI Processing
Service). Every fixture must always:
- validate against the *current* DTO class (backward compatibility — no
  field removed, renamed, retyped, or newly required), and
- validate with an unknown extra field injected (forward compatibility — a
  newer additive producer must not break an older consumer).

A breaking change now fails `nx test shared-dtos` — already in every CI and
pre-merge path — with a spec whose header explains the two legal outs: make
the field optional, or bump the version and add a new fixture *beside* the
old one. Meta-tests keep the fixture set honest: every event type in the
version registry must have fixture coverage, including one at its current
version.

**2. `eventVersion` check at every consumer boundary
(`event-versions.ts`).** A single `EVENT_VERSIONS` registry in `shared-dtos`
records the version each event type is currently at;
`assertSupportedEventVersion()` throws a typed
`UnsupportedEventVersionError` on a version from the future or an
unregistered event type. Called in all four consumers next to the existing
class-validator payload check (decision 9's boundary), with broker-matched
failure policy:
- **RabbitMQ consumers** (Content, AI Processing) let it throw → retry
  cycle → DLQ (BUG-0007), where manual replay after a consumer upgrade is
  exactly the decision-10 workflow. AI Processing checks *before* taking its
  Redis dedupe claim so a mismatch never holds a claim it can't complete.
- **Kafka consumers** (Analytics, Notification) catch it, log at error
  level, and skip — rethrowing would make kafkajs retry forever and block
  the partition behind one unreadable event, and this design has no Kafka
  DLQ. Same policy the shared `KafkaConsumer` already applies to malformed
  JSON.

## Alternatives considered
- **Schema registry (Confluent-style) with compatibility modes.** The real
  answer at organizational scale — and a new infra piece plus a
  serialization-format migration (Avro/Protobuf/JSON-Schema) for a
  one-team workspace whose contracts live in one library. SPEC boundary
  says ask before new infra; not worth it here.
- **Snapshot tests of class-validator metadata.** Catches *any* change, not
  *breaking* change — additive fields would fail the snapshot too, training
  people to update it reflexively, which destroys the signal.
- **JSON Schema files + a diff/compat checker in CI.** Duplicate source of
  truth beside the classes; drift between schema files and decorators
  becomes its own bug class.
- **Consumers reject on version *mismatch* (`!==`) instead of only
  future versions (`>`).** Would force every consumer deploy to precede the
  producer's version bump even for compatible changes — stricter than the
  additive-only model needs.

## Consequences
- A breaking DTO edit is now a red CI run with an explanation, not a
  production incident three services away.
- The fixtures double as documentation: the file reads as a history of what
  each event has looked like on the wire.
- Cost carried: fixtures must be added when a new event type or version
  ships (the meta-tests remind), and the registry is one more thing the
  producer of a new version must touch — deliberate friction at exactly the
  moment a human should be thinking about compatibility.
- Not covered: semantic changes that keep the shape (e.g. redefining what
  `categories: []` means). No mechanism catches that; prose in ADRs remains
  the tool.

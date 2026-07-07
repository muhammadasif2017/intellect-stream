# ADR-0003: Kafka in KRaft mode, no Zookeeper

## Status
Accepted

## Date
2026-07-07

## Context
The original compose file ran Kafka 7.6 with a Zookeeper ensemble for cluster coordination. Zookeeper support was removed entirely in Kafka 4.0 (2025); KRaft (Kafka Raft) is the only forward-compatible architecture, moving metadata/consensus into Kafka itself.

## Decision
Single Kafka container with `KAFKA_PROCESS_ROLES: broker,controller` (combined mode). Zookeeper container and volumes deleted.

## Alternatives Considered

### Keep Zookeeper
- Pros: matches older tutorials and docs.
- Cons: dead architecture; an extra container to run; learning obsolete configuration.
- Rejected: starting a new project on a removed architecture is indefensible.

## Consequences
- One less container; `KAFKA_CONTROLLER_QUORUM_VOTERS` replaces `KAFKA_ZOOKEEPER_CONNECT` — beware Zookeeper-era documentation.
- A `kafka-data` volume that ever ran Zookeeper mode must be wiped (`docker compose down -v`) before first KRaft boot — metadata formats are incompatible.
- Gotcha found during verification: the container healthcheck CLI (`kafka-broker-api-versions`) spawns a JVM per check and intermittently exceeded a 5s timeout, flapping the container to `unhealthy` while the broker was fine. Healthcheck now uses 15s timeout + 30s start period.
- Verified working: full boot + produce/consume round-trip (2026-07-07).
- Deep rationale: `docs/interview-questions.md`, question 4.

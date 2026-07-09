# Interview Questions & Answers — intellect-stream

This document collects the architectural interview questions raised during the project, with complete answers written in plain, professional language. Each question maps to a real decision made in this codebase (see the Decisions Log in `SPEC.md`), so every answer can be defended with a working example.

New questions are added as each milestone completes.

---

## 1. Why use RabbitMQ for AI processing jobs instead of a Kafka consumer group?

**Short answer:** RabbitMQ tracks the delivery state of every individual message, which is exactly what a task queue needs. Kafka only tracks a single position (offset) per partition, which is exactly what an event log needs. AI moderation jobs are tasks, so RabbitMQ is the right fit.

**Detailed answer:**

The two brokers are built on opposite philosophies:

- **RabbitMQ** is a *smart broker*: it remembers the state of each message (delivered, acknowledged, failed), and deletes messages once a consumer confirms successful processing.
- **Kafka** is a *smart consumer* system: the broker just stores an ordered, immutable log of events. Each consumer group remembers only one number per partition — "I have read up to position X."

This difference has four practical consequences for our AI processing workload:

**a) Individual message acknowledgment.**
An AI moderation job calls an external API (Cloudflare Workers AI). It can take several seconds and can fail on its own — a timeout, a rate limit, a malformed image. With RabbitMQ, if job #5 fails, the consumer rejects only that message and the broker redelivers it later; jobs #6 through #100 continue normally. With Kafka, there is no way to say "message 5 failed but message 6 succeeded" — there is only one offset. You must either stop at message 5 (blocking everything behind it — this is called *head-of-line blocking*) or move past it and separately deal with the failure yourself.

**b) Built-in retry and dead-letter queues.**
RabbitMQ provides dead-letter exchanges and per-queue message TTLs out of the box. With configuration alone, you get "retry this message 3 times with increasing delays, then move it to a dead-letter queue for manual inspection." Kafka has no built-in equivalent — teams that need this behavior build a chain of retry topics (for example `retry-5s`, `retry-1m`, `dead-letter`) and write the consumer logic that moves messages between them. That is an entire subsystem you must build and maintain yourself.

**c) Flexible scaling of workers.**
With RabbitMQ (using `prefetch=1`), any new consumer you add immediately starts pulling work from the queue. Work is distributed dynamically: fast workers take more jobs, slow workers take fewer. With Kafka, the maximum number of active consumers in a group equals the number of partitions, which is fixed when the topic is created. A 7th consumer on a 6-partition topic sits idle. Additionally, every time a consumer joins or leaves the group, Kafka pauses the group to reassign partitions (a *rebalance*).

**d) Long-running work fights Kafka's health model.**
Kafka assumes a consumer that has not polled for new messages within `max.poll.interval.ms` is dead, and triggers a rebalance. A slow AI call can exceed that limit, causing Kafka to reassign the job to another consumer *while the original is still processing it* — producing duplicate API calls and repeated rebalances. This is tunable, but you are working against the tool's design. RabbitMQ's model (a message stays "unacknowledged" until the worker finishes) tolerates slow work naturally.

**What you would lose by swapping them:**

| Capability | RabbitMQ (task queue) | Kafka (consumer group) |
|---|---|---|
| Acknowledge/retry a single message | Built in | Not possible (offset only) |
| Dead-letter queue | Built in (configuration) | Must be hand-built with retry topics |
| Add workers beyond initial plan | Any number, instantly effective | Capped by partition count |
| Slow jobs (seconds each) | Handled naturally | Risks rebalance storms |
| Replay history | Not possible (messages deleted after ack) | Built in (log is retained) |
| Multiple independent readers of same data | Requires duplicate queues | Built in (consumer groups) |

The last two rows explain the other half of the architecture: **analytics events are facts, not tasks.** We want to keep them, replay them to rebuild aggregates, and let multiple services read the same stream independently. That is Kafka's strength and RabbitMQ's weakness.

**A 2026 nuance an interviewer may raise:** Kafka 4.0 introduced *share groups* (KIP-932, "Queues for Kafka"), which add per-message acknowledgment semantics to Kafka and remove the partition-count cap on consumer parallelism — directly addressing points (a) and (c) above. The honest response: share groups are new and not yet the ecosystem norm, and they still do not provide RabbitMQ's mature retry tooling — dead-letter exchanges, per-queue TTLs, and configuration-only backoff chains (point b) — nor do they change the underlying fit argument: moderation jobs gain nothing from a retained log. The choice of RabbitMQ still stands; acknowledging share groups shows your knowledge is current rather than memorized.

**Interview one-liner:** *"Commands go to a queue; facts go to a log. Moderation jobs are commands — they need per-message acknowledgment, retries, and dead-lettering. Analytics events are facts — they need retention, replay, and multiple independent readers. That's why the job path is RabbitMQ and the event path is Kafka."*

---

## 2. At-least-once delivery means the AI service may receive the same job twice. Where should deduplication live — and why is "check before calling Cloudflare" the wrong-but-tempting answer?

**Short answer:** Checking for duplicates before the API call is not enough, because the consumer can crash *after* the API call but *before* acknowledging the message. The correct design accepts that the API call may run twice and instead makes the *outcome* idempotent: the result publication and the database update must be safe to repeat.

**Detailed answer:**

First, why duplicates happen at all. RabbitMQ redelivers a message whenever it is not acknowledged — and the acknowledgment only happens after your code finishes. Consider this failure sequence:

1. Consumer receives job #42.
2. Consumer calls Cloudflare Workers AI. The call succeeds.
3. Consumer crashes (deploy, out-of-memory, network drop) before sending the acknowledgment.
4. RabbitMQ sees an unacknowledged message and redelivers job #42 to another consumer.

The tempting fix is: "before calling Cloudflare, check whether I've already processed this message ID." But look at the sequence again — at step 4, was job #42 processed or not? The API call happened, but the result was never published and the message was never acknowledged. From the system's point of view, the job is *incomplete*. If your dedupe check says "already seen, skip it," you have now lost the moderation result forever: the API was called, but nothing downstream ever heard about it.

The deeper principle: **you cannot atomically combine an external API call with a message acknowledgment.** There will always be a crash window between them. So the design must tolerate the API call running twice.

The correct placement of idempotency is at the *effects*, not the *trigger*:

1. **Accept duplicate API calls as a cost.** Calling Cloudflare twice for the same post wastes one API call but corrupts nothing — moderation of the same content returns the same (or equivalent) verdict. This is a deliberate trade-off: a rare wasted call is cheaper than a lost result.
2. **Make the result handling idempotent.** The moderation result message carries the original message ID (per Decision 6 in the SPEC: the outbox row's UUID travels with the message). When the Content Service consumes `moderation.completed`, it applies the update idempotently — for example, an `UPDATE ... WHERE id = X` that produces the same final state no matter how many times it runs, or an insert guarded by a unique constraint on the message ID.
3. **Use dedupe as an optimization, not as the correctness mechanism.** A Redis `SETNX` check before the API call is still worth adding — it skips *most* duplicate work cheaply. The key insight is that it reduces cost; it does not guarantee correctness. Correctness comes from idempotent effects downstream.

**Interview one-liner:** *"You can't make an external API call and a message acknowledgment atomic, so a pre-call dedupe check can't be the correctness mechanism — a crash between the call and the ack makes the job look 'done' when its result was lost. Instead, let the call occasionally run twice and make every downstream effect idempotent. Pre-call dedupe is a cost optimization layered on top."*

---

## 3. What is the outbox pattern, and why does this project need it?

**Short answer:** The outbox pattern guarantees that a database change and the event announcing that change either both happen or neither happens. Without it, a crash at the wrong moment produces a database row with no event, or an event with no database row.

**Detailed answer:**

Consider what the Content Service must do when a post is created:

1. Insert the post into its Postgres database.
2. Publish a "post created" message so the AI service moderates it.

These are two different systems (Postgres and RabbitMQ), and there is no transaction that spans both. Whichever order you choose, a crash between the two steps breaks the system:

- *Database first, then publish:* a crash after the insert means the post exists but no moderation job was ever queued. The post sits unmoderated forever.
- *Publish first, then database:* a crash after publishing means the AI service processes a post that does not exist.

The outbox pattern solves this by using the one transactional tool we do have — the database itself:

1. In a **single database transaction**, insert the post into the `posts` table **and** insert a pending message into an `outbox` table. Because both writes are in one transaction, they succeed or fail together.
2. A separate process (the *relay*) reads pending rows from the outbox table, publishes them to the broker, and marks them as sent.

If the relay crashes after publishing but before marking the row as sent, it will publish the message again on restart. This means the outbox gives **at-least-once delivery** — duplicates are possible, which is exactly why every outbox row gets a UUID that travels with the message (Decision 6) and why consumers must be idempotent (see Question 2).

**Relay implementation choice (Decision 7):** this project uses a *polling publisher* — a simple loop that queries the outbox table every few hundred milliseconds. The alternative is Change Data Capture (CDC) with a tool like Debezium, which tails the database's write-ahead log and publishes changes with lower latency. CDC avoids polling load and reduces latency, but requires running and operating Kafka Connect and Debezium — significant extra infrastructure. For this project's scale, polling is the right trade-off: simpler, no new moving parts, and the added latency (one poll interval) is irrelevant for moderation jobs.

**Interview one-liner:** *"You can't have a transaction across Postgres and RabbitMQ, so I write the event into an outbox table inside the same database transaction as the business change, and a relay publishes it afterwards. That converts a dual-write problem into at-least-once delivery plus idempotent consumers — a much easier problem to solve."*

---

## 4. Why run Kafka in KRaft mode instead of with Zookeeper?

**Short answer:** Zookeeper was Kafka's original external coordination service, but Kafka replaced it with a built-in consensus protocol called KRaft. Zookeeper support was removed entirely in Kafka 4.0, so KRaft is the only forward-compatible choice — and it means one less system to run and operate.

**Detailed answer:**

Historically, Kafka delegated cluster coordination — tracking which brokers are alive, electing partition leaders, storing topic configuration — to Apache Zookeeper, a separate distributed system. That meant every Kafka deployment was really two deployments: the Kafka brokers plus a Zookeeper ensemble, each with its own configuration, monitoring, and failure modes.

KRaft (Kafka Raft) moves that coordination into Kafka itself, using the Raft consensus algorithm. A set of Kafka nodes act as *controllers* that maintain cluster metadata; in a small setup, the same node can serve as both broker and controller (which is exactly what our single-node development setup does — see `docker-compose.yml`, where the Kafka container declares `KAFKA_PROCESS_ROLES: broker,controller`).

The benefits:

- **One less system to deploy, secure, monitor, and upgrade.** In our compose file, this literally removed a container.
- **Faster metadata operations and recovery.** Metadata is stored as a Kafka log itself, so controller failover no longer requires reloading state from an external store.
- **It is the only supported path.** KRaft became production-ready in Kafka 3.3, became the default, and Kafka 4.0 removed Zookeeper support completely. Starting a new project on Zookeeper in 2026 means starting on a dead architecture.

The one caveat worth mentioning in an interview: a lot of older documentation, tutorials, and Stack Overflow answers assume Zookeeper-era configuration, so you need to be careful which docs you follow — the settings differ (for example `KAFKA_CONTROLLER_QUORUM_VOTERS` replaces `KAFKA_ZOOKEEPER_CONNECT`).

**Interview one-liner:** *"KRaft replaces the external Zookeeper ensemble with Kafka's own Raft-based controller quorum — same guarantees, one less distributed system to operate, and it's the only architecture Kafka 4.x supports."*

---

## 5. Why does each service get its own database? Why is a shared database forbidden?

**Short answer:** A shared database silently couples services at the schema level, which defeats the main purpose of splitting into services: the ability to change, deploy, and scale each one independently.

**Detailed answer:**

If the Content Service and the Analytics Service both read the `posts` table directly, then the table's schema is no longer private to the Content Service — it has become a public contract. Now:

- The Content Service cannot rename a column, change a type, or restructure tables without checking every other service that touches them. Schema migrations require cross-team (or cross-service) coordination and often lockstep deploys.
- Services can bypass each other's business rules. If the Content Service enforces "a post must pass moderation before `status` becomes `published`," a service writing to the table directly can violate that invariant, and no code review of the Content Service will catch it.
- Load from one service degrades another. An expensive analytics query locks or slows the same tables the Content Service needs for user-facing writes.

With one database per service, the *only* way other services learn about content is through the Content Service's published contracts: its REST API and the events it emits. Those contracts are explicit, versioned, and validated (Decision 9) — unlike a database schema, which becomes a contract by accident.

The cost of this rule is real, and you should name it in an interview: **no cross-service joins and no cross-service transactions.** If the Analytics Service needs post data, it must build its own read model by consuming events — which introduces eventual consistency (see Question 6). This is a trade: you give up the convenience of joins and ACID transactions across domains, and in exchange you get independent deployability, independent scaling, and explicit contracts.

In this project the rule shows up concretely in Decision 5: even though the AI Processing Service *produces* the moderation verdict, it does not write to the posts table. It publishes a `moderation.completed` event, and the Content Service — the sole owner of the posts table — applies the update.

**Interview one-liner:** *"A shared database turns your schema into an unversioned public API. Database-per-service forces all integration through explicit contracts — REST and events — at the cost of cross-service joins and transactions, which you replace with event-driven read models and eventual consistency."*

---

## 6. The moderation flow is eventually consistent — a post exists before its moderation verdict arrives. Why is that acceptable, and how do you handle it?

**Short answer:** Because the alternative — making post creation wait for an external AI call — couples user-facing latency and availability to a third-party API. Seconds of verdict lag is a product non-issue; a post creation that hangs when Cloudflare is slow is a real problem.

**Detailed answer:**

The full flow is: post created → moderation job queued (via outbox) → AI service calls Cloudflare → `moderation.completed` event published → Content Service updates the post's moderation status. Between creation and the final update, the post exists in a `pending` moderation state.

Why this is the right design:

- **Availability isolation.** If moderation were synchronous, every post creation would block on an external HTTP call. Cloudflare being slow or down would make *our* write path slow or down. Asynchronous processing means the Content Service's availability depends only on its own database and the outbox table.
- **The product tolerates it.** Content platforms routinely hold new posts in a pending or limited-visibility state briefly. The pending state is not a bug to hide — it is an explicit state in the domain model (`pending` → `approved` / `rejected`), visible in the API, and the UI can render it honestly.
- **Backpressure for free.** If moderation traffic spikes, the queue absorbs the burst and workers drain it at their own pace. A synchronous design would instead shed load with timeouts and errors at the user-facing edge.

How it is handled concretely:

1. The post is created with an explicit `moderationStatus: pending` field — consumers of the API are told the truth rather than shown a fake "approved" state.
2. Business rules key off that state (for example, a pending post might be visible only to its author).
3. The eventual update is idempotent and correlated: the `moderation.completed` event carries the correlation ID and message UUID, so the update is traceable end-to-end and safe under redelivery.

**Interview one-liner:** *"I made the pending state a first-class part of the domain model instead of hiding it. Synchronous moderation would couple our write availability to a third-party API; eventual consistency costs a few seconds of verdict lag, which the product tolerates by design."*

---

## 7. Why does the API Gateway call the Content Service over plain HTTP instead of using the message brokers?

**Short answer:** Because a CRUD request/response is inherently synchronous — the caller is waiting for the answer. Putting a message broker in the middle of a synchronous path adds latency and complexity while providing benefits (buffering, replay, decoupling in time) that a waiting caller cannot use.

**Detailed answer:**

The decision (Decision 4) is about matching the communication style to the interaction:

- When a user creates or fetches a post, the client is actively waiting for the result. The gateway must return the post (or an error) *now*. This is a request/response interaction, and HTTP is the natural, well-understood tool for it: status codes, timeouts, retries, and load balancing all come standard.
- Brokers shine when the caller does *not* need to wait: fire-and-forget commands, fan-out notifications, buffering bursts. Routing a synchronous read through RabbitMQ means: publish a request message, block waiting on a reply queue, correlate the response, handle timeout — a hand-built, slower imitation of what HTTP already does.

The honest cost of this choice is **temporal coupling**: if the Content Service is down, the gateway's calls to it fail immediately. But note that a broker would not actually fix this for reads — if the Content Service is down, no answer is coming regardless; the broker would only delay the failure. Temporal coupling is intrinsic to synchronous interactions, not an artifact of HTTP.

The rule of thumb worth stating: **synchronous interactions (queries, CRUD) use synchronous transport (HTTP); asynchronous facts and commands (domain events, jobs) use brokers.** This project uses all three transports, each where its semantics fit: HTTP for the query path, RabbitMQ for work distribution, Kafka for event streaming.

**Interview one-liner:** *"The transport should match the interaction semantics. A waiting caller gains nothing from a broker — it just gets a slower, hand-rolled request/response. I use HTTP where the caller waits, RabbitMQ where work is distributed, and Kafka where facts are streamed."*

---

## 8. What is a correlation ID, and why add it to every message contract from day one?

**Short answer:** A correlation ID is a unique identifier generated at the edge (the API Gateway) and copied into every log line, message, and event produced while handling that original request. It is the thread that lets you trace one user action across all five services. It is added on day one because retrofitting it later means touching every contract and every service at once.

**Detailed answer:**

In a monolith, one request produces one stack trace — debugging is grep. In this system, a single "create post" request touches, in order: the API Gateway, the Content Service, Postgres, the outbox relay, RabbitMQ, the AI Processing Service, Cloudflare, RabbitMQ again, the Content Service again, Kafka, the Analytics Service, and the Notification Service's WebSocket. When something goes wrong — a post stuck in `pending`, say — the question "what happened to *this specific request*?" spans eight hops and five log streams.

The correlation ID answers it:

1. The API Gateway generates a UUID for each incoming request (or accepts one from an `X-Correlation-Id` header).
2. Every service includes that ID in every log statement it writes while handling the request.
3. Every message contract in `shared-dtos` carries a `correlationId` field, so the ID survives each hop through RabbitMQ and Kafka (Decision 8).
4. To debug, you search all logs for one UUID and get the complete story of one request, in order, across every service.

Why day one and not later: the ID must be *propagated* — each service copies it from the incoming request or message into everything it emits. That propagation logic touches every contract and every producer/consumer. Adding it while there are zero contracts costs one field and a habit. Adding it after five services are built means a coordinated change across the entire system, and until it is everywhere, it works nowhere (a trace with a gap in the middle does not answer the question).

Also worth distinguishing in an interview: correlation IDs are the manual, lightweight version of **distributed tracing** (OpenTelemetry, Jaeger), which additionally records timing spans and parent-child relationships. Correlation IDs answer "what happened to this request?"; tracing additionally answers "where did the time go?". Starting with correlation IDs and adopting OpenTelemetry later is a standard progression.

**Interview one-liner:** *"One user action fans out across five services and three transports; the correlation ID is the single key that stitches those logs back into one story. It costs one field per contract if you add it on day one, and a system-wide coordinated change if you add it later."*

---

## 9. Your messaging is at-least-once. Why not exactly-once?

**Short answer:** True exactly-once *delivery* across independent systems is not achievable — any acknowledgment can be lost, forcing a choice between maybe-lost (at-most-once) and maybe-duplicated (at-least-once). We choose at-least-once, because duplicates can be neutralized with idempotency, while lost messages are unrecoverable.

**Detailed answer:**

The three delivery guarantees:

- **At-most-once:** send and don't retry. Nothing is ever duplicated, but a lost message is gone forever. Unacceptable here — a lost moderation job means a post is never moderated.
- **At-least-once:** retry until acknowledged. Nothing is ever lost, but retries can duplicate (the classic case: the message was processed but the acknowledgment was lost, so it is sent again).
- **Exactly-once:** every message processed precisely once. Within a single closed system this can be engineered (Kafka offers transactional exactly-once *within* Kafka-to-Kafka pipelines), but our flow crosses Postgres, RabbitMQ, an external HTTP API, and Kafka. Across independent systems, some acknowledgment can always be lost in a crash window, so the guarantee cannot be provided by the transport alone.

So the realistic engineering position is: **at-least-once delivery plus idempotent processing equals exactly-once *effect*.** The transport may deliver a message twice, but if processing it twice leaves the system in the same state as processing it once, the duplication is invisible. That is precisely this project's design:

- The outbox relay may republish (Question 3) — at-least-once out of the Content Service.
- RabbitMQ may redeliver (Question 2) — at-least-once into the AI service.
- Every message carries the outbox row's UUID (Decision 6), and every consumer deduplicates or applies idempotent updates — unique constraints for database writers, Redis `SETNX` for stateless steps.

**Interview one-liner:** *"Exactly-once delivery across heterogeneous systems is a myth — an ack can always be lost. The practical formula is at-least-once delivery plus idempotent consumers, which yields exactly-once effects, and that's what the message UUIDs and consumer-side dedupe in this system implement."*

---

## 10. What happens to a message that keeps failing? Walk through your dead-letter strategy.

**Short answer:** A failing message is retried a bounded number of times with delays; if it still fails, it moves to a dead-letter queue where it is logged and alerted on, and a human decides whether to replay it. Bounded retries prevent one poison message from consuming the workers forever.

**Detailed answer:**

Failures split into two categories, and the strategy must treat them differently:

- **Transient failures** — Cloudflare timeout, rate limit, brief network issue. Retrying after a delay usually succeeds. These deserve automatic retries with increasing (backoff) delays, so a struggling downstream service is not hammered.
- **Permanent failures** — malformed payload, a bug in the consumer, content the API always rejects. No number of retries will ever succeed. These are *poison messages*: without a retry limit, one of them loops through the queue forever, wasting worker capacity and polluting logs.

The pipeline (Decision 10):

1. The consumer rejects the failed message; RabbitMQ's dead-letter-exchange configuration routes it to a retry queue with a TTL, producing a delay before redelivery.
2. Retries are bounded (for example, 3 attempts). RabbitMQ tracks delivery attempts in the `x-death` header, so the consumer can see how many times a message has failed.
3. After the final failure, the message routes to the **dead-letter queue (DLQ)**. It is not discarded — the payload, headers, and correlation ID are preserved.
4. Arrival in the DLQ is logged and alerted on. In this project's early milestones the "alert" is a log entry and the RabbitMQ management UI; the principle is that a DLQ nobody watches is just a slow way of deleting messages.
5. Replay is **manual**: a human inspects the message (the correlation ID links it to full request history — Question 8), fixes the underlying cause (deploy a fix, adjust data), and re-publishes the message to the original queue.

Why manual replay rather than automated? Automated replay of a permanently failing message is just a slower infinite retry loop. Replay is only useful *after the cause is fixed*, and knowing the cause is fixed requires a human (at this project's scale). Larger systems sometimes automate replay after deploys — that is an evolution, not a starting point.

**Interview one-liner:** *"Bounded retries with backoff absorb transient failures; the bound protects the workers from poison messages. What survives the retries lands in a DLQ that is logged and alerted — because a DLQ nobody watches is just deferred message deletion — and replay is manual because replaying before the root cause is fixed is just a slower retry loop."*

---

## 11. How will you decide the number of partitions for your Kafka topics?

**Short answer:** Partition count is deliberately deferred to the Analytics milestone (per SPEC), but the decision framework is: partitions = the maximum consumer parallelism you need, chosen with awareness that ordering is only guaranteed *within* a partition, and that partitions are easy to add but disruptive to rethink.

**Detailed answer:**

Three facts drive the decision:

1. **Partitions cap parallelism.** A consumer group can have at most one active consumer per partition. Six partitions means at most six parallel consumers; a seventh idles. So the floor for partition count is the peak parallel processing you expect to need.
2. **Ordering is per-partition only.** Kafka guarantees message order within a partition, not across the topic. Events are assigned to partitions by key. If the analytics service must see events for a given post in order (created → moderated → viewed), then `postId` must be the partition key, so all of that post's events land in the same partition and stay ordered.
3. **Adding partitions later changes key mapping.** You can increase a topic's partition count, but the key-to-partition assignment changes: new events for a key may land in a different partition than its old events, breaking ordering assumptions during the transition. This is why the choice deserves actual thought rather than a default.

This also explains Decision 11 (disabling auto-topic-creation at the Analytics milestone): with auto-creation on, the first producer to touch a topic creates it with the broker default of one partition — the partition strategy gets decided silently, by accident. Turning auto-creation off forces the topic design — name, partition count, key — to be an explicit, reviewable decision.

The reasoning to present at the milestone: identify the partition key from ordering requirements first (likely `postId`), then choose a partition count comfortably above expected consumer parallelism (small over-provisioning is cheap — idle partitions cost little; under-provisioning caps throughput).

**Interview one-liner:** *"Partition key comes from ordering requirements — order is only guaranteed within a partition. Partition count comes from target consumer parallelism, sized with headroom because repartitioning later disturbs key ordering. And I disabled topic auto-creation so this decision gets made explicitly instead of defaulting to one partition by accident."*

---

## 12. How does Redis-based rate limiting at the API Gateway work, and why Redis rather than in-memory?

**Short answer:** Each request increments a counter in Redis keyed by client identity and time window; requests over the limit are rejected with HTTP 429. Redis rather than process memory because the counter must be *shared* — the moment the gateway runs as more than one instance, per-process counters multiply the effective limit by the instance count.

**Detailed answer:**

The simplest robust algorithm is a fixed window counter:

1. Derive a key from client identity and the current window, e.g. `ratelimit:{userId}:{floor(now/60s)}`.
2. `INCR` the key; if this is the first increment, set an expiry equal to the window so stale counters clean themselves up.
3. If the counter exceeds the limit, reject with `429 Too Many Requests` (ideally with a `Retry-After` header); otherwise pass through.

`INCR` is atomic — two simultaneous requests cannot read the same value and both pass a check they should not. This matters because a naive read-then-write implementation has a race condition under concurrency.

Why not just a counter in the gateway's memory?

- **Horizontal scaling breaks it.** Two gateway instances each holding their own counter means a client's real limit is 2× the intended one, and it drifts with instance count. Redis gives all instances one shared source of truth.
- **Restarts reset it.** An in-memory counter forgets everything on deploy; an attacker just has to wait for (or trigger) restarts.

The fixed window has one known weakness worth naming: bursts at window boundaries. A client can spend its full quota in the last second of one window and again in the first second of the next — briefly double the intended rate. If that matters, the refinement is a **sliding window** (commonly implemented with a Redis sorted set of request timestamps, trimming entries older than the window) or a **token bucket**, both of which smooth the boundary at the cost of slightly more Redis work per request. Fixed window is the right starting point; the upgrade path is well-trodden.

**Interview one-liner:** *"Atomic INCR on a key of client-plus-window, expiry for cleanup, 429 over the limit. It lives in Redis because rate limits must be enforced per client, not per gateway instance — in-memory counters multiply the limit by your instance count and reset on every deploy. Fixed window first; sliding window or token bucket if boundary bursts ever matter."*

---

## 13. WebSocket connections are stateful. How does the Notification Service deliver an event to the right user, and what breaks when you scale it to two instances?

> **Status: proposed design, not yet decided.** The Redis pub/sub approach below is one candidate; the actual decision (transport feeding the service + socket registry location) is an Open Architectural Question in `SPEC.md`, owned at milestone 7. Treat this answer as the reasoning framework, not the settled design.

**Short answer:** The service maintains a registry mapping user IDs to their live socket connections; when an event arrives, it looks up the user's sockets and pushes. With one instance the registry can be in memory. With two instances it breaks — the event may be consumed by the instance that does *not* hold the user's socket — and the standard fix is a shared pub/sub layer (Redis) that broadcasts events to all instances.

**Detailed answer:**

The single-instance design:

1. A client connects over WebSocket and authenticates; the service records `userId → socket` in an in-memory map (one user may have several sockets — phone and laptop).
2. The service consumes events (for example `moderation.completed`) from the broker.
3. For each event, it resolves which user should be notified, looks the user up in the registry, and pushes the payload down each of their live sockets. If the user is not connected, the notification is simply not delivered live (persisting missed notifications is a separate, deliberate feature decision).
4. On disconnect, the socket is removed from the registry.

Now scale to two instances behind a load balancer, and two independent problems appear:

- **Socket locality.** Alice's WebSocket landed on instance A. The event that should reach her is consumed from the queue by instance B. Instance B checks its registry — Alice is not there — and the notification silently vanishes, *intermittently*, depending on which instance consumed the event. This is the classic distributed-WebSocket failure, and it is nondeterministic and painful to debug if you have never seen it before.
- **Delivery topology mismatch.** From RabbitMQ, two instances consuming one queue means each event goes to *one* of them (work-queue semantics) — the wrong one, half the time. What notifications actually need is *broadcast*: every instance should see every event, and each instance delivers to whichever sockets it holds.

The standard solution is a shared broadcast layer: each instance subscribes to Redis pub/sub (this is exactly what Socket.IO's Redis adapter automates). Events are published to a channel all instances receive; each instance forwards to its local sockets and ignores users it does not hold. Alternatively with Kafka, give each instance its own consumer group so all instances receive all events — same broadcast effect. Redis pub/sub's fire-and-forget delivery is acceptable here because live notifications are inherently best-effort (the user might be offline anyway); anything requiring guaranteed delivery belongs in a persistent notification store, not the socket push path.

**Interview one-liner:** *"WebSockets pin state to an instance, so the instance that consumes an event may not hold the target user's socket. The fix is to change delivery from work-queue to broadcast — Redis pub/sub to all instances, each forwarding to its local sockets. It's the textbook example of why 'stateless services scale horizontally' has an asterisk."*

---

## 14. Decision 6 says "idempotency via outbox-row UUID as message ID, deduped per consumer at build time." Milestone 5 built two consumers — why do they use two different dedupe mechanisms for the same decision?

**Short answer:** AI Processing Service (stateless, no DB) dedupes with Redis `SETNX` on the message id; Content Service (has Postgres) dedupes with a DB unique constraint written in the same transaction as the state change it guards. Same decision, different mechanism, because the two consumers have different storage available — decision 6 explicitly leaves the mechanism "decided per consumer at build time."

**Detailed answer:**

Both consumers need the same guarantee: RabbitMQ is at-least-once, so a crash between processing a message and acking it causes redelivery, and redelivery must not double-apply the effect. What differs is what each consumer can use to remember "I already did this."

**Content Service — DB unique constraint.** It already has a transactional store, and the effect it's protecting (updating a post's moderation status) lives in that same store. So the dedupe row (`ProcessedMessage.messageId`, `@id` = unique) is written inside the *same* `$transaction` as the `Post` update:

```
await tx.processedMessage.create({ data: { messageId } });
await tx.post.update({ where: { id: postId }, data: { status: verdict } });
```

If both succeed, the transaction commits atomically — the fact "processed" and the effect "post updated" can never disagree. If the message is redelivered, the second `processedMessage.create` throws a unique-constraint violation (`P2002`), the whole transaction rolls back including the *attempted* second `post.update`, and the consumer just logs and returns instead of erroring. This is the strongest form of dedupe available: it can't drift from the state it's protecting, because they commit or fail together.

**AI Processing Service — Redis `SETNX`.** It has no database — its only effect is an HTTP call out (Cloudflare Workers AI) plus a message published back. There's nothing to wrap a DB transaction around. So the guard has to live in something that isn't the effect itself: Redis, claimed *before* the CF call and released *only on failure*:

```
const claimed = await redis.set(key, 'processing', { NX: true, EX: 300 });
if (!claimed) return; // real duplicate, already in flight or done
try {
  // classify + publish
  await redis.set(key, 'done', { EX: 86400 });
} catch (err) {
  await redis.del(key); // let a retry actually retry
  throw err;
}
```

The claim-then-release shape matters: if the key were only set *after* success (no upfront claim), two redeliveries arriving close together could both pass CF Workers AI and both publish — real double-processing, real double cost. If the key were claimed and *never released on failure*, a message that failed for a transient reason (CF Workers AI down for 10 seconds) would look "already handled" forever and a manual DLQ replay would silently no-op. The claim blocks concurrent duplicates; the release-on-failure keeps failure recoverable.

The unifying principle: dedupe has to live somewhere at least as durable as the effect it's guarding, and as close to that effect as possible. A DB-backed consumer gets that for free via a transaction. A stateless consumer has to construct it explicitly, and has to think about the failure path the DB-transaction version gets automatically (rollback).

**Interview one-liner:** *"Same idempotency decision, two mechanisms, because the two consumers have different storage. The DB consumer dedupes in the same transaction as its state change — they commit or fail together, which is the strongest guarantee you can get. The stateless consumer has nothing to transact against, so Redis SETNX simulates it: claim before the risky work, release only on failure, so a genuine retry can still retry but a true duplicate gets skipped."*

---

## 15. Milestone 6 adds Kafka so Analytics Service can see moderation verdicts. Why does that fact flow through Content Service's outbox instead of AI Processing Service just publishing it to Kafka directly, the same way it already publishes to RabbitMQ?

**Short answer:** A first-draft design did exactly that — dual-publish from AI Processing Service's stateless handler — and it was a dual-write bug caught in design review before any code was written (logged as BUG-0005). Two broker publishes with no shared transaction means a partial failure is invisible: RabbitMQ succeeds, Kafka fails, and nothing anywhere reports it. Routing the Kafka fact through Content Service's outbox instead reuses machinery that already solves exactly this problem for the DB→broker case.

**Detailed answer:**

The tempting design: AI Processing Service already publishes `moderation.completed` to RabbitMQ after calling Cloudflare Workers AI. Milestone 6 needs that same fact to also reach Kafka, so why not add a second `publisher.publish()` call right next to the first one?

Trace the failure mode. The handler is stateless — no database, no transaction to wrap both publishes in. If the RabbitMQ publish succeeds and the Kafka publish then fails (broker hiccup, topic not provisioned yet, network blip), there is no error anywhere: the RabbitMQ leg already returned success, so the handler returns normally. Content Service updates the post's status correctly. Analytics Service simply never receives that event — a silent, permanent gap, undetectable without manually cross-checking counts between services. Worse: if that RabbitMQ message is ever DLQ-replayed, the handler mints a brand-new `messageId` (`randomUUID()`) on the retry, so even a *successful* replay produces a different id than the original attempt — defeating the dedupe mechanism (decision 6) a retry is supposed to be safe under.

This is a dual-write: two independent systems updated from one piece of logic, no atomicity between them, no shared identity to reconcile a partial failure against. It's precisely the failure category the outbox pattern (decision 7) already exists to prevent for "update my DB and tell the world" — but AI Processing Service has no DB to anchor an outbox row in, so bolting a second publish onto its handler reintroduces the hazard one layer over, with nothing to catch it.

The fix: don't publish from the point of origin at all. Content Service already consumes `moderation.completed` off RabbitMQ and updates the post row inside one Prisma transaction (`ProcessedMessage` insert + `Post` update, same commit or rollback). Add one more statement to that transaction: insert an outbox row for the same fact, carrying forward the original `correlationId` from the inbound envelope (not minting a new one — decision 8 wants the whole chain traceable as one request). The existing outbox relay — already at-least-once, already dedupe-safe, already the thing decision 14 built a `Publisher` interface and an `eventType → destination` routing table specifically to extend — picks the row up and routes it to Kafka. Analytics Service dedupes on that outbox-minted `messageId`, the exact same `ProcessedMessage` pattern Content Service uses on itself.

Concretely, `RELAY_ROUTING` changed shape from `eventType → destination string` to `eventType → { broker, destination }`, and the relay resolves its publisher from a small `{ rabbitmq, kafka }` registry instead of a single injected one. `KafkaPublisher` is a second, independent implementation of the same `Publisher` interface — no coupling to `RabbitMqPublisher` — so the relay's routing logic doesn't know or care which concrete broker a given row ends up on.

The tell that this was the intended path all along, not just a nicer alternative: decision 14's routing-table comment says verbatim that a destination-column-per-row design was rejected because "one event needs two destinations... duplicating rows would mint two messageIds for one fact and corrupt dedupe" — and that Kafka would "slot into the same seam at milestone 6." Dual-publishing from a second location skips that seam entirely; routing through the outbox is what the seam was built for.

**Interview one-liner:** *"The naive move was to publish the verdict to Kafka right next to the existing RabbitMQ publish. That's a dual-write with no shared transaction and no shared identity across brokers — a partial failure is invisible, and a DLQ replay even mints a different message id than the original. The fix reuses the outbox: Content Service, which already updates the post in a transaction, adds one more row to that same transaction, and the existing relay — already at-least-once, already dedupe-safe — delivers it to Kafka. One durable source of truth instead of two independent publishes hoping they both land."*

---

*Add new questions here as milestones complete. Format: question as asked in an interview, short answer first, detailed reasoning, then a one-liner you can deliver verbally.*

# Stage 36: Performance, Load, and Reliability Testing Plan — Mini-Spec

## 1. Intent

Design a practical, staged performance, load, and reliability testing plan for the ticketing system that:
- Reflects realistic organization-wide usage patterns (400–500 daily active users).
- Validates that the current architecture (API + web + workers + Redis + Postgres + SSE + Riser-backed assistant) behaves predictably under load.
- Surfaces bottlenecks and instability early, with clear, actionable follow-ups.

The goal is to have a repeatable testing regimen we can run before major releases and capacity changes, not a one-off exercise.

## 2. Problem Statement

The system is now feature-rich and production-ready in terms of functionality, but we have not yet:
- Systematically validated end-to-end performance under realistic and peak workloads.
- Characterized how the system behaves under sustained load (soak), sudden traffic spikes (burst), or partial failures (e.g., worker or Redis issues).
- Verified that real-time SSE updates, queues, and the policy-grounded assistant remain stable when many users are active concurrently.

Without a structured plan:
- We risk latent bottlenecks in critical workflows (ticket list, inbox, detail, notifications).
- We lack confidence in how the queue/worker system behaves when backlogs form.
- We have no objective thresholds for “fast enough” or “acceptable error rate”.

This mini-spec defines a realistic, maintainable plan to close that gap.

## 3. Scope

**In scope:**
- HTTP/API layer for:
  - Ticket CRUD and list views.
  - Inbox/actionable queue.
  - Ticket detail and comments/subtasks.
  - Notifications listing/mark-read.
  - AI assistant endpoints (`/ai/chat`, `/ai/handbook-chat`) under realistic usage.
  - Admin knowledge-base document listing; Riser sync only in targeted tests.
- Worker and queue behavior (notification fanout/dispatch, SLA jobs) from the perspective of:
  - Backlog growth and drain rates.
  - Job latency and error behavior.
- SSE real-time behavior under concurrent event streams.
- End-to-end behavior in an environment that resembles production (single and multi-instance where possible).

**Out of scope (for Stage 36):**
- Full-blown chaos engineering (random pod kills, network partitions) beyond a few targeted failure-mode tests.
- Full browser-based E2E perf measurements across all routes (we will focus on API-level workloads plus a few browser-side observations).
- Storage-heavy attachments load tests until S3-compatible storage + CORS + domains are fully configured (we will define where to plug these in later).

## 4. Test Categories

We will use the following test categories, all primarily driven by **k6** for HTTP workloads, plus targeted scripts where needed:

1. **Baseline Load Tests**
   - Purpose: Confirm basic steady-state performance at realistic average concurrent usage (e.g., 30–50 virtual users).
   - Workflows: Mix of ticket list, ticket detail, inbox, comments, assistant queries.
   - Metrics: p50/p95 latency, error rate, throughput.

2. **Peak Load Tests**
   - Purpose: Simulate short-duration peaks approaching worst-case usage (e.g., 100–150 virtual users).
   - Focus: Identify endpoints that degrade fastest (ticket list, inbox, assistant chat).
   - Metrics: p95/p99 latency, error spikes, server resource usage.

3. **Soak / Endurance Tests**
   - Purpose: Run moderate load for extended periods (e.g., 2–4 hours) to uncover:
     - Memory leaks.
     - Gradual performance degradation.
     - Growing queue backlogs or connection counts.
   - Workflows: Lighter, but continuous traffic on core user flows.

4. **Spike Tests**
   - Purpose: Simulate sudden step changes in traffic (e.g., 5 → 100 VUs within seconds) to validate:
     - Connection pool behavior (DB, Redis).
     - API instance ramp-up behavior.
     - Error spikes and recovery.

5. **Concurrency / Contention Tests**
   - Purpose: Stress areas with shared resources/state:
     - Many users hitting the same ticket or inbox simultaneously.
     - High write concurrency on comments / subtasks.
   - Metrics: Lock contention, DB slow query count, 409/500 responses, latency under contention.

6. **SSE / Real-Time Tests**
   - Purpose: Validate:
     - Many concurrent SSE connections to notifications stream.
     - Stability of reconnect behavior under API restarts or network blips.
     - Impact of SSE on API throughput.
   - Tooling: k6 where feasible (HTTP), plus lightweight Node/WebSocket-like scripts tailored to SSE.

7. **Queue / Worker Behavior Tests**
   - Purpose: Observe:
     - How notification/SLA queues behave under load.
     - Backlog growth vs processing rate.
     - Retry and dead-letter behavior for intentionally failed jobs.
   - Approach: Combine HTTP load that triggers notifications with monitoring of BullMQ metrics and logs.

8. **Assistant / Policy-Grounded Chatbot Load**
   - Purpose: Validate:
     - Riser-backed RAG queries under concurrent load.
     - OpenAI API rate and error handling paths.
   - Scope: Focus on `/ai/chat` and `/ai/handbook-chat`, not agent tool-calling at this stage.

9. **Targeted Failure-Mode / Resilience Tests**
   - Purpose: Manually simulate:
     - Worker process down while API continues serving.
     - Redis unavailable or restarting.
     - Assistant provider (OpenAI/Riser) intermittent errors.
   - We will define a few manual scenarios with observed metrics, not fully automated chaos tests.

## 5. Core Workflows to Simulate

We will define k6 “scenarios” around the following workflows, tuned by role:

1. **Ticket List / Dashboard**
   - Endpoints:
     - GET `/tickets` with typical filters.
     - GET `/tickets/my-summary`.
     - GET `/reporting/summary` (lightweight aggregates) in selected scenarios.
   - Behavior: Page through first N pages with realistic parameters (status, market/studio filters).

2. **Actionable Inbox**
   - Endpoints:
     - GET `/tickets/inbox-folders`.
     - GET `/tickets` with inbox filters (READY/assigned items).
   - Behavior: Simulate “work the queue” actions: mark notification read, open ticket detail for inbox items.

3. **Ticket Detail and Comments/Subtasks**
   - Endpoints:
     - GET `/tickets/:id`.
     - POST `/tickets/:id/comments`.
     - PATCH `/tickets/:id/subtasks/:subtaskId`.
   - Behavior: A small fraction of traffic performing writes (comments and status/subtask updates) against recently accessed tickets.

4. **Notifications / Inbox Read Operations**
   - Endpoints:
     - GET `/notifications`.
     - PATCH `/notifications/:id/read`.
     - POST `/notifications/read-all`.
   - Behavior: Poll notifications regularly, mark a subset as read.

5. **Assistant / Handbook Chat**
   - Endpoints:
     - POST `/ai/chat`.
     - POST `/ai/handbook-chat`.
   - Behavior:
     - Majority of queries short, FAQ-like.
     - Some fraction intentionally ambiguous or out-of-domain to exercise “no policy match” path.
   - Note: Keep OpenAI and Riser usage within sensible quotas — we will keep RAG tests smaller and focused.

6. **SSE Notification Stream**
   - Endpoint:
     - GET `/notifications/stream` (SSE).
   - Behavior:
     - Many concurrent clients opening SSE.
     - Some churn (disconnect/reconnect).
     - Trigger server-side events via ticket/comment updates.

7. **Admin Workflows (targeted only)**
   - Endpoints:
     - GET `/ai/documents`.
     - POST `/ai/riser/sync` (low frequency, targeted test).
   - Behavior:
     - Light load, mostly functional verification under concurrent system load.
   - Rationale: Admin actions are infrequent; we mostly care about them not timing out or causing systemic issues during peak periods.

8. **Attachments (later stage)**
   - Once S3/bucket CORS + public endpoints are fully configured in staging:
     - Endpoints:
       - POST `/tickets/:id/attachments/upload-url`.
       - Direct PUT to storage presigned URL.
       - POST `/tickets/:id/attachments/confirm`.
     - Behavior:
       - Low to moderate rate of medium-sized uploads.
   - For Stage 36, we document this as a “plug-in” scenario; we do not run heavy attachment perf tests on partially configured local storage.

## 6. Metrics and Thresholds

We will define explicit thresholds to decide pass/fail, tuning them based on baseline measurements:

1. **Latency**
   - Per key endpoint group:
     - **p50**: ≤ 300 ms for list/detail reads under baseline load.
     - **p95**: ≤ 800 ms under baseline, ≤ 1500 ms under peak.
     - **p99**: ≤ 2500 ms under peak, with small tail (e.g., < 1% of requests).
   - Writes (comments, subtasks, ticket updates):
     - p95 ≤ 1200 ms under baseline; ≤ 2000 ms under peak.

2. **Error Rates**
   - Overall:
     - Baseline/soak: **< 0.5%** non-4xx errors (5xx, network).
     - Peak/spike: **< 1–2%** transient errors acceptable if they recover quickly and are not systemic.
   - Assistant endpoints:
     - Explicitly track:
       - Non-2xx from `/ai/chat` / `/ai/handbook-chat`.
       - Provider-specific errors (rate limits, timeouts) and how we handle them.

3. **Throughput**
   - Track requests/sec for:
     - Tickets list.
     - Ticket detail.
     - Assistant chat.
   - We want to identify the point at which throughput plateaus or decreases as VUs increase (sign of saturation).

4. **Queue Backlog and Latency**
   - Metrics:
     - Queue length over time for notification/SLA queues.
     - Job processing latency (enqueue-to-complete).
     - Number of retries and dead-lettered jobs.
   - Thresholds:
     - Under baseline: steady, small backlog; most jobs processed within a few seconds.
     - Under peak: backlog may grow temporarily but should drain within a defined window after load subsides (e.g., 5–10 minutes).

5. **SSE Stability**
   - Metrics:
     - Number of open SSE connections over time.
     - Connection error/reconnect rate.
   - Thresholds:
     - Under moderate concurrency (e.g., 50–100 SSE clients), connections remain stable with low reconnect churn.

6. **Resource Usage**
   - CPU:
     - API and workers should remain under ~70–80% sustained CPU during baseline and soak; short bursts at peak are acceptable.
   - Memory:
     - No steady upward drift over multi-hour soak tests (indicative of leaks).
   - DB:
     - Connection pool within configured limits; no frequent pool exhaustion.
   - Redis:
     - Latency within low-millisecond range; no frequent reconnect storms.

7. **Slow Queries**
   - Track queries exceeding:
     - 200 ms for “hot path” queries (current list/detail queries).
     - 500 ms for heavier reporting queries.
   - Threshold:
     - Slow queries should be rare and not dominate during baseline load.

## 7. Environment and Tooling Strategy

1. **Environments**
   - **Local dev:**
     - Use for:
       - Smoke-level k6 runs with low VUs to validate scripts.
       - Quick checks on new endpoints or workflow scripts.
     - Not used for final threshold decisions (insufficient fidelity).
   - **Staging-like environment (preferred for Stage 36):**
     - API + web deployed similarly to planned production (e.g., Render/Fly).
     - Managed Postgres (Neon) and Redis configured as in prod.
     - S3-compatible storage + CORS properly configured (once ready) for attachment tests.
     - Prefer running k6 from a machine/runner with low latency to staging (e.g., CI runner or dev laptop in a consistent region).
   - **Multi-instance tests:**
     - Once we have multiple API instances behind a load balancer:
       - Re-run core scenarios to watch:
         - Load distribution.
         - SSE connection behavior behind load balancer.
         - Consistency of response times.

2. **Tooling**
   - **k6 (primary):**
     - Organize scripts by scenario:
       - `ticket-workflows-baseline.js` (extends current groundwork).
       - `ticket-workflows-peak.js`.
       - `ticket-workflows-soak.js`.
       - `assistant-load.js`.
       - `sse-basic.js` (if modeled via HTTP streaming).
     - Use k6 scenarios to mix workflows with realistic arrival patterns.
   - **Node/TypeScript utility scripts (secondary):**
     - For more nuanced SSE tests (more control over reconnection behavior).
   - **Infra monitoring tools:**
     - DB (Neon) dashboards for CPU/IO/connections.
     - Redis provider dashboards for latency/ops/sec.
     - App hosting metrics (Render/Fly) for CPU and memory.

3. **Safety and Reusability**
   - Keep k6 scripts parameterized by:
     - Base URL.
     - Number of VUs.
     - Durations and ramping profiles.
   - Tests must be:
     - Idempotent or designed to tolerate repeated runs.
     - Safe against data bloat (e.g., using fixed number of “test users/tickets” or periodic cleanup).

## 8. Observability Requirements

During each test run, we should have:

1. **Application-Level**
   - Access to app logs (API + workers) with:
     - Request logs for key endpoints (or aggregate metrics).
     - Error stack traces.
     - Notable warnings (e.g., rate limits, timeouts).
   - Health endpoints:
     - `/api/health` and `/api/health/queues` polled periodically (by k6 or a separate checker) to:
       - Detect degradation.
       - Confirm components are alive.

2. **Database**
   - Neon metrics:
     - CPU, connections, buffer/cache hit ratio.
     - Slow query logs enabled.
   - Ability to review:
     - Top slow queries during tests.
     - Spike patterns aligned with test windows.

3. **Redis / Queue**
   - Queue depth, processing rates, and failure counts from:
     - BullMQ dashboards or custom logs.
   - Redis metrics:
     - Latency, failed commands, reconnections.

4. **Infrastructure**
   - Hosting metrics (API + web + workers):
     - CPU, memory, restarts over time.
   - Network-level indicators, if available:
     - Error spikes that might indicate upstream provider or network issues.

5. **Assistant / External Providers**
   - Error logs from:
     - OpenAI calls.
     - Riser API sync (where included).
   - Track:
     - Rate-limit responses.
     - Timeouts.
     - Impact on overall latency.

6. **Client-Side (selected runs)**
   - During small-scale runs, keep browser open to:
     - Observe SSE notification behavior subjectively.
     - Spot obvious UI issues (spinners that never stop, etc.).

## 9. Execution Order

We will execute tests in a staged order, where each stage must pass basic criteria before moving to the next:

1. **Script Validation (Local, Low VU)**
   - Run each k6 scenario at low volume (e.g., 1–5 VUs) against local or staging env.
   - Validate:
     - No obvious errors (404/500 due to bad URLs, auth).
     - Workflows behave as intended.

2. **Baseline Load (Staging)**
   - Run `ticket-workflows-baseline` at ~30–50 VUs for 15–30 minutes.
   - Record:
     - p50/p95/p99 latency, error rate, resource usage.
   - Adjust thresholds based on these initial observations.

3. **Assistant / Handbook Load**
   - Run `assistant-load` with realistic concurrency (e.g., 10–20 VUs) and rate.
   - Confirm:
     - Stable latencies.
     - Acceptable provider error behavior.

4. **Soak / Endurance**
   - Run a moderate load scenario (e.g., 20–30 VUs) for 2–4 hours.
   - Monitor:
     - Memory and CPU trends.
     - Queue behavior.
     - SSE connection stability (where included).

5. **Peak Load**
   - Ramp up to higher VUs (e.g., 100–150) for 10–20 minutes.
   - Watch:
     - Latency tails (p95/p99).
     - Error bursts.
     - DB/Redis saturation.
   - Use this to refine capacity expectations and scaling plans.

6. **Spike Tests**
   - Use k6 ramping arrivals (or sudden VU jumps) to:
     - Go from low to high load quickly.
   - Observe:
     - Whether the system recovers gracefully after spike ends.
     - Any prolonged error states.

7. **Targeted Concurrency / Contention**
   - Scenario focused on:
     - Many users hitting the same ticket/inbox at once.
   - Ensure:
     - No unexpected deadlocks or 500s.
     - Acceptable latencies under contention.

8. **Failure-Mode Scenarios (Manual)**
   - While running a moderate load:
     - Temporarily stop a worker process.
     - Briefly disable Redis or simulate outage.
     - Observe:
       - How backlogs and errors behave.
       - How gracefully the system recovers when components return.

9. **Optional Attachments Perf (Once Ready)**
   - After S3/storage + CORS + DOMAINS are fully configured:
     - Add attachment scenarios with moderate upload volumes.

## 10. Likely Bottlenecks / Risk Areas

Based on architecture and previous work, likely hotspots include:
- **Ticket list and inbox queries:**
  - Complex filters and joins; risk of slow queries under heavy filters or large data volumes.
- **Notification fanout/dispatch:**
  - Many events for popular tickets or broad notifications could stress queues and workers.
- **SSE:**
  - Large numbers of concurrent SSE connections can:
    - Increase memory usage.
    - Affect file descriptor limits.
- **Assistant / RAG:**
  - Vector search queries and OpenAI calls may add latency.
  - Rate limits or network instability can cause error bursts.
- **DB connection pools:**
  - Under multi-instance load, risk of pool saturation or high contention if defaults are too low.

Stage 36’s plan focuses on revealing and quantifying these, not prematurely optimizing everything.

## 11. Reporting Format

Each test run should produce a short, structured report (markdown or shared doc) with:

1. **Scenario Summary**
   - Scenario name(s).
   - Purpose (baseline, peak, soak, spike, failure-mode).

2. **Environment**
   - Environment URL (staging/prod-like).
   - API/web versions or git commit hash.
   - Instance counts (API, workers).

3. **Load Profile**
   - VUs / arrival rate.
   - Test duration.
   - Ramping profile (e.g., ramp-up 5m → steady 20m → ramp-down 5m).

4. **Key Metrics**
   - For key endpoints:
     - p50/p95/p99 latency.
     - Request/second.
     - Error rate (by status code).
   - Queue metrics:
     - Max backlog.
     - Typical processing latency.
   - Resource usage:
     - Max/sustained CPU and memory for API, workers.
     - DB and Redis highlights.

5. **Observations**
   - Notable behaviors:
     - Spikes in latency or errors.
     - Slow queries identified.
     - Unexpected logs or warnings.

6. **Pass/Fail Assessment**
   - Did we meet the thresholds defined in Section 6?
   - If not, which endpoints/scenarios failed and why?

7. **Recommended Follow-Ups**
   - Concrete next steps, such as:
     - “Optimize ticket list query where filter X is used.”
     - “Increase worker concurrency for queue Y.”
     - “Add caching for /my-summary under inbox-heavy load.”

## 12. Acceptance Criteria

Stage 36 is considered “complete” when:
- **Design-level**
  - All test categories outlined above are defined in enough detail to implement k6 scripts and supporting tools without ambiguity.
  - Core workflows and endpoints to be tested are clearly enumerated.
  - Metrics and thresholds are documented and agreed upon as realistic.
- **Operational**
  - The environment and observability requirements are documented so that:
    - A staging-like environment can be prepared for testing.
    - Necessary dashboards/logging are configured or can be enabled with minimal work.
- **Execution Ready**
  - For each planned scenario, we know:
    - The env to run it on.
    - Approximate VUs/durations.
    - How we will capture and interpret results.
- **Non-Goals / Boundaries**
  - We have explicitly deferred:
    - Heavy attachment load tests until storage/CORS/domains are fully ready.
    - Full-blown chaos engineering beyond a few targeted failure-mode tests.

This mini-spec should allow a senior engineer or SRE to implement the test suite in a focused, incremental manner, surfacing the most critical performance and reliability issues before expanding the user base in production.


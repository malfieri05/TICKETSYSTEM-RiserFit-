# Ticketing System Load Tests

This folder contains baseline k6 load tests for the ticketing system.

## Baseline workflow test

Script: `baseline-ticket-workflows.js`

### What this test does

- Simulates **moderate real-world usage**, *not* a max-stress scenario.
- VU profile:
  - 30s ramp up to 50 virtual users
  - 120s sustain at 50 VUs
  - 30s ramp down
- Each virtual user:
  - Logs in via `POST /api/auth/login`
  - Performs a mix of workflows:
    - ~60% ticket list + inbox-style reads
      - `GET /api/tickets`
      - `GET /api/tickets?actionableForMe=true`
      - `GET /api/tickets/inbox-folders`
    - ~25% ticket detail reads
      - `GET /api/tickets/:id` (uses ids from the list responses)
    - ~10% summary / notifications
      - `GET /api/tickets/scope-summary`
      - `GET /api/notifications`
    - ~5% low-frequency writes
      - `POST /api/tickets/:id/comments` (short baseline comment)
- Writes are intentionally low volume so this stays safe for local/staging baselines.

## Prerequisites

1. **k6 installation**

   - macOS (Homebrew):

     ```bash
     brew install k6
     ```

   - Linux (Debian/Ubuntu):

     ```bash
     sudo apt-get update
     sudo apt-get install -y gnupg software-properties-common
     curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
     echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
     sudo apt-get update
     sudo apt-get install -y k6
     ```

   - Windows (Chocolatey):

     ```powershell
     choco install k6
     ```

   See the official docs for other options: `https://k6.io/docs/get-started/installation/`.

2. **API running**

   - Start the API locally (from repo root):

     ```bash
     cd apps/api
     npm run dev
     ```

   - Confirm it is reachable at `http://localhost:3001` or adjust `BASE_URL` accordingly.

3. **Test credentials**

   - Ensure you have a valid user account (ideally a non-admin test user) that can log in via `POST /api/auth/login`.
   - Set environment variables when running the test:

     - `BASE_URL` (optional, defaults to `http://localhost:3001`)
     - `TEST_EMAIL` (required)
     - `TEST_PASSWORD` (required)

## Running the baseline test

From the repo root:

```bash
BASE_URL=http://localhost:3001 \
TEST_EMAIL="your-user@example.com" \
TEST_PASSWORD="your-password" \
k6 run load-tests/baseline-ticket-workflows.js
```

You can also override the VU/stage profile via `--vus` / `--duration` flags if you want a shorter smoke run while developing the test.

## Metrics to watch

Key built-in k6 metrics for this baseline:

- **`http_req_failed`**
  - Threshold: `< 0.01` (fewer than 1% failed requests).
  - Watch for spikes or growing failure rates.

- **`http_req_duration`**
  - Threshold: `p(95) < 500ms`.
  - Focus on `p(95)` and `p(99)` to understand tail latency under moderate load.

- **`checks`**
  - Overall success of functional checks (login success, 200/201 responses, JSON parse). A low pass rate indicates functional or auth issues, not just performance.

- **Per-endpoint trends (via tags, if you extend the script)**
  - For deeper analysis you can add tags to calls (e.g. `tags: { endpoint: 'tickets_list' }`) and break down latency per workflow.

## Notes

- This is a **baseline workflow test**, designed to approximate normal usage and catch regressions in typical user flows.
- It is **not** a destructive or maximum throughput stress test:
  - Write operations are limited to a small fraction of requests.
  - SSE endpoints (e.g. notification streams) are intentionally not exercised here.
- Prefer to run against a **staging** or **pre-production** environment that mirrors production settings where possible.
- Clean up any baseline comments or data in long-lived environments if necessary.


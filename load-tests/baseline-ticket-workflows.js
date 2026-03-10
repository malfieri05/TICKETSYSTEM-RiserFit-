import http from 'k6/http';
import { check, sleep } from 'k6';

// Baseline ticketing-system workflow load test
// --------------------------------------------------
// Profile: 30s ramp up → 120s sustain → 30s ramp down
// Goal: simulate moderate real-world usage (reads-heavy, low writes)

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // ramp up to 50 VUs
    { duration: '120s', target: 50 }, // sustain
    { duration: '30s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],   // < 1% failures
    http_req_duration: ['p(95)<500'], // p95 < 500ms baseline target
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'malfieri05@gmail.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'changeme-password';

// Per-VU auth token and last-seen ticket id
let authToken;
let currentTicketId = null;

function authHeaders() {
  return {
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
}

// Login once per VU (first iteration); reuse token afterwards
function loginIfNeeded() {
  if (authToken) return;

  const url = `${BASE_URL}/api/auth/login`;
  const payload = JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  const res = http.post(url, payload, params);

  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: has access_token': (r) => {
      try {
        const body = r.json();
        return body && typeof body.access_token === 'string';
      } catch (_) {
        return false;
      }
    },
  });

  if (!ok) {
    // If login fails, abort this iteration gracefully
    return;
  }

  const body = res.json();
  authToken = body.access_token;
}

// ---- Workflows ---------------------------------------------------------

// 1) Ticket list + inbox-style reads (also seeds currentTicketId)
function workflowTicketLists() {
  const params = authHeaders();

  // Global ticket list
  const listRes = http.get(`${BASE_URL}/api/tickets?page=1&limit=20`, params);
  check(listRes, {
    'tickets list: status 200': (r) => r.status === 200,
    'tickets list: valid JSON': (r) => {
      try {
        return !!r.json();
      } catch (_) {
        return false;
      }
    },
  });

  try {
    const body = listRes.json();
    const tickets = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    if (tickets.length > 0) {
      const randomIndex = Math.floor(Math.random() * tickets.length);
      currentTicketId = tickets[randomIndex].id || currentTicketId;
    }
  } catch (_) {
    // ignore parse errors here, checks already recorded
  }

  // Actionable tickets for current user
  const actionableRes = http.get(
    `${BASE_URL}/api/tickets?actionableForMe=true&page=1&limit=20`,
    params,
  );
  check(actionableRes, {
    'actionable list: status 200': (r) => r.status === 200,
  });

  // Inbox folders (department topics); ignore 403 for non-department roles
  const inboxRes = http.get(`${BASE_URL}/api/tickets/inbox-folders`, params);
  check(inboxRes, {
    'inbox folders: 200/403 ok': (r) => r.status === 200 || r.status === 403,
  });
}

// 2) Ticket detail reads using a previously seen ticket id
function workflowTicketDetail() {
  if (!currentTicketId) return;
  const params = authHeaders();

  const res = http.get(`${BASE_URL}/api/tickets/${currentTicketId}`, params);
  check(res, {
    'ticket detail: status 200': (r) => r.status === 200,
  });
}

// 3) Notifications / summary reads
function workflowNotificationsAndSummary() {
  const params = authHeaders();

  const summaryRes = http.get(`${BASE_URL}/api/tickets/scope-summary`, params);
  check(summaryRes, {
    'scope-summary: status ok': (r) => r.status === 200 || r.status === 403,
  });

  const notifRes = http.get(`${BASE_URL}/api/notifications?page=1&limit=20`, params);
  check(notifRes, {
    'notifications: status 200': (r) => r.status === 200,
  });
}

// 4) Low-frequency write: add a comment on the current ticket
function workflowPostComment() {
  if (!currentTicketId) return;
  const params = authHeaders();

  const payload = JSON.stringify({
    body: `k6 baseline comment at ${new Date().toISOString()}`,
    isInternal: false,
  });

  const res = http.post(
    `${BASE_URL}/api/tickets/${currentTicketId}/comments`,
    payload,
    params,
  );

  check(res, {
    'post comment: 201/200/204': (r) => [200, 201, 204].includes(r.status),
  });
}

// ---- Default function --------------------------------------------------

export default function () {
  loginIfNeeded();
  if (!authToken) {
    // If login failed, back off a bit to avoid hammering auth
    sleep(1);
    return;
  }

  const r = Math.random();

  if (r < 0.6) {
    // ~60%: ticket/inbox list work
    workflowTicketLists();
  } else if (r < 0.85) {
    // ~25%: ticket detail views
    workflowTicketDetail();
  } else if (r < 0.95) {
    // ~10%: notifications + scope summary
    workflowNotificationsAndSummary();
  } else {
    // ~5%: low-volume writes
    workflowPostComment();
  }

  // Small think time to avoid unrealistically tight loops
  sleep(1);
}


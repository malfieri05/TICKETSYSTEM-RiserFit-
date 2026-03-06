/**
 * k6 load test — Riser Fitness Ticketing API
 *
 * Prerequisites:
 *   1. Install k6:  brew install k6
 *   2. Start the API:  cd apps/api && npx ts-node --transpile-only src/main.ts
 *   3. Ensure at least one user exists (e.g. run seed):  npx prisma db seed
 *
 * Run from repo root:
 *   k6 run load-test.js
 *
 * Options (override with -e):
 *   BASE_URL=http://localhost:3001  (default)
 *   DEV_LOGIN_EMAIL=malfieri05@gmail.com
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API = `${BASE_URL}/api`;
const DEV_LOGIN_EMAIL = __ENV.DEV_LOGIN_EMAIL || 'malfieri05@gmail.com';

// Get a JWT once so all VUs can hit protected endpoints
function getToken() {
  const res = http.post(`${API}/auth/dev-login`, JSON.stringify({ email: DEV_LOGIN_EMAIL }), {
    headers: { 'Content-Type': 'application/json' },
  });
  const ok = check(res, { 'dev-login succeeded': (r) => r.status === 200 });
  if (!ok) {
    console.warn('Dev-login failed. Ensure API is running and user exists. Status:', res.status, res.body);
    return null;
  }
  const body = JSON.parse(res.body);
  return body.access_token || body.token || null;
}

export const options = {
  // Ramp up, hold, ramp down
  stages: [
    { duration: '30s', target: 20 },   // 0 → 20 virtual users over 30s
    { duration: '1m', target: 50 },    // 20 → 50 over 1m
    { duration: '2m', target: 50 },    // hold 50 users for 2m
    { duration: '30s', target: 0 },    // ramp down to 0
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],           // < 5% errors
    http_req_duration: ['p(95)<2000'],         // 95% of requests < 2s
  },
};

let authToken;

export function setup() {
  authToken = getToken();
  if (!authToken) throw new Error('Could not get auth token. Check API and dev-login.');
  return { token: authToken };
}

export default function (data) {
  const token = data.token;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // 1) List tickets (home page)
  const r1 = http.get(`${API}/tickets?page=1&limit=20`, { headers });
  check(r1, { 'tickets list 200': (r) => r.status === 200 });

  // 2) My summary (dashboard)
  const r2 = http.get(`${API}/tickets/my-summary`, { headers });
  check(r2, { 'my-summary 200': (r) => r.status === 200 });

  sleep(0.5 + Math.random() * 1.5); // 0.5–2s think time between iterations
}

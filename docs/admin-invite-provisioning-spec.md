# Admin Invite-Only User Provisioning — Revised Mini-Spec & Implementation Plan

**Status:** Post–senior-review (v1.1 design)  
**Audience:** Implementation engineers  
**Scope:** Closed-system provisioning only. **No code** in this document.

**Revision focus:** Token surface, DB constraints, resend vs regenerate, transaction semantics, ADMIN scope, validation matrix, DTOs, audit, async email, frontend token hygiene, locked name policy, failure UX, module boundaries, API contracts.

---

### 1. Objective

Deliver **invitation-based, admin-controlled account provisioning** for the internal ticketing platform:

- Only **ADMIN** actors create pending identities with **pre-bound** `Role` and visibility scope (where applicable per role).
- New humans enter **only** via a **single-use, time-limited** setup flow; **no** public signup and **no** invitee-selected permissions.
- **API is source of truth**; persistence aligns with Prisma (`User`, `UserDepartment`, `UserStudioScope`, `users.email` **unique**).
- **Deterministic**, **auditable**, production-grade security; SSO-ready later via existing `User.ssoId` without redesigning invite provenance.

---

### 2. Recommended Product Model

- **UserInvitation** = immutable **provisioning intent** until accepted or revoked: fixed email, name, role, and role-specific scope payload.
- **Acceptance** = **one atomic DB transaction**: lock invite → validate → create user + junction rows → mark invite `ACCEPTED` (or **full rollback** on any failure).
- **Email** = delivery channel; inbox possession is the phase-1 ownership proof.

**v1 decisions (non-negotiable):**

| Topic | Rule |
|--------|------|
| Name | **Required** on invite (`seedName` → `User.name`). Invitee **cannot** change it. |
| Role / scope | **Read-only** on acceptance UI; loaded from server only after `POST /invitations/validate`. |
| Invitee supplies | **Password** (+ confirmation in UI only; single field in API). |

There is **no** signup page without a valid invite token flow.

---

### 3. Invitation Data Model Recommendation

**Prisma model `UserInvitation`** → table `user_invitations`.

| Field | Type | Notes |
|--------|------|--------|
| `id` | `String` @id @default(cuid()) | |
| `emailNormalized` | `String` | **Single canonical key**; see **Email normalization** below. |
| `invitedByUserId` | `String` | FK → `users.id` (ADMIN). |
| `tokenHash` | `String` | **`SHA-256` digest** of raw token (implementation: hex or fixed-length binary); **never** plaintext. Verification: **constant-time** compare of computed hash to stored `tokenHash`. **Do not** use bcrypt or other KDF for invite tokens. |
| `tokenVersion` | `Int` @default(1) | Increment **only** on **Regenerate** (audit + troubleshooting). Unchanged on **Resend**. |
| `status` | Enum | **`PENDING` \| `ACCEPTED` \| `EXPIRED` \| `REVOKED`** only. **No `SUPERSEDED` in v1.** Regenerate mutates the same row. |
| `expiresAt` | `DateTime` | |
| `acceptedAt` | `DateTime?` | Set when transaction commits successfully. |
| `revokedAt` | `DateTime?` | |
| `lastSentAt` | `DateTime?` | |
| `sendCount` | `Int` @default(0) | Increment on each successful enqueue of invite email (create + resend + regenerate). |
| `assignedRole` | `Role` | |
| `seedName` | `String` | |
| `departmentsJson` or structured columns | As needed | **DEPARTMENT_USER** only; Prisma `Department[]` via JSON or join table on invite—implementation choice; must mirror acceptance inserts. |
| `defaultStudioId` | `String?` | **STUDIO_USER** only. |
| `additionalStudioIds` | `String[]` / JSON | **STUDIO_USER** optional. |
| `createdUserId` | `String?` | FK after acceptance. |
| `createdAt` / `updatedAt` | `DateTime` | |

**Explicitly omitted on invitation row for v1:** `marketId`, `teamId` (see §4 for ADMIN; non-ADMIN assignments use studio/department model only on invite).

**Email normalization (canonical — mandatory):**

- **Definition:** `emailNormalized = email.trim().toLowerCase()` (Unicode lowercasing per host language default; document if locale edge cases matter).
- **Apply** this function **before** every `UserInvitation` DB write, every **comparison** to `users.email` / invite rows, and every **uniqueness** check (pending partial index, collision detection). Persist `User.email` using this same normalized value at acceptance.

**DB constraints (mandatory):**

```sql
-- Exactly one PENDING invite per normalized email (Postgres partial unique index)
CREATE UNIQUE INDEX user_invitations_one_pending_email
ON user_invitations (email_normalized)
WHERE status = 'PENDING';
```

- **No** reliance on “application-only” enforcement for this rule. Services may still pre-check for clearer errors, but **DB is authoritative**.
- Non-pending rows may repeat `emailNormalized` historically (e.g. after `ACCEPTED`, a new `PENDING` could be created only if no other `User` row conflicts—see §8).

**Index — `tokenHash` (mandatory):**

- Create a **non-unique** B-tree index on `token_hash` (column for `tokenHash`). **Unique index not required** (hash collisions theoretically possible; row lock + status disambiguate). Purpose: **O(log n) lookup** for validate/accept and **no full table scans** under load or probing.
- Partial unique on `tokenHash` WHERE `status='PENDING'` is **optional** and **not** required for v1.

---

### 4. Role / Scope Assignment Rules

**Deterministic validation matrix** — enforced in **`InvitationService`** (and mirrored in DTO/`class-validator` for transport). **No exceptions.**

| Rule ID | Role | Requirement |
|---------|------|-------------|
| R-ADMIN-1 | `ADMIN` | `defaultStudioId` **MUST** be `null` / omitted. |
| R-ADMIN-2 | `ADMIN` | `additionalStudioIds` **MUST** be absent or empty array. |
| R-ADMIN-3 | `ADMIN` | Department list **MUST** be absent or empty. |
| R-ADMIN-4 | `ADMIN` | **`marketId` and `teamId` are DISALLOWED on the invitation** for v1. `User.marketId` and `User.teamId` **MUST** be set to **`null`** at acceptance. Admins adjust location/team after login via existing admin tools if needed. |
| R-DEPT-1 | `DEPARTMENT_USER` | **≥1** department; each value **MUST** equal a Prisma `Department` enum member (`HR`, `OPERATIONS`, `MARKETING`, `RETAIL`). |
| R-DEPT-2 | `DEPARTMENT_USER` | Studio fields **MUST** be null / empty. |
| R-STU-1 | `STUDIO_USER` | `defaultStudioId` **REQUIRED**; must reference an existing `Studio` (and pass whatever “active” rules existing admin flows use). |
| R-STU-2 | `STUDIO_USER` | `additionalStudioIds` **optional**; each ID must exist; **dedupe** against `defaultStudioId`. |
| R-STU-3 | `STUDIO_USER` | After dedupe, **≥1** unique studio (always true if R-STU-1 holds). Department list **MUST** be empty. |
| R-CROSS-1 | all | Creating invite **rejected** if `users.email` **already exists** (same normalization as `emailNormalized`), regardless of `isActive`. |

On acceptance, `InvitationService` maps payload to `User` + `UserDepartment` / `UserStudioScope` **only** as dictated by this matrix.

---

### 5. Security Model

**Token generation & storage**

- **Entropy:** raw token **`crypto.randomBytes(32)`** — **256 bits** of CSPRNG output (minimum acceptable entropy for v1).
- **Encoding for email/link:** **base64url** (unpadded typical) → **~43 characters**. The canonical secret is the **32 raw bytes**; the string in the URL/body is that material encoded for transport.
- **Storage:** `tokenHash = SHA-256(rawTokenBytes)` where `rawTokenBytes` are the pre-encoding bytes (i.e. hash the **decoded** secret bytes supplied in `POST` body after base64url decode — implementation must **hash the same material** that was generated). **Persist only `tokenHash`.** **Do not** use bcrypt, scrypt, or PBKDF2 for invite tokens.
- **Verification:** decode POST body token string **base64url → 32 bytes** (reject wrong length); `computedHash = SHA-256(rawTokenBytes)`; compare **`computedHash`** to DB `tokenHash` using **constant-time** equality only (e.g. Node `crypto.timingSafeEqual(Buffer.from(computedHash,'hex'), Buffer.from(stored,'hex'))` when storing hex digests).

**Token validation surface (CRITICAL)**

| Rule | Specification |
|------|----------------|
| **No GET validation** | There is **no** `GET /invitations/validate` and **no** API that reads the raw token from query or path. |
| **Validation transport** | Raw token is sent **only** in **`POST /invitations/validate`** body (`ValidateInvitationDto`). |
| **Accept transport** | Raw token **only** in **`POST /invitations/accept`** body (`AcceptInvitationDto`). |
| **Email link** | May include `?token=` **only** so the browser can load the accept page once. This is **not** a validation endpoint. |

**Email link → browser hygiene**

1. User opens `https://{WEB_ORIGIN}/invite/accept?token=...` (initial load only).
2. Client reads token **once** from `window.location`, immediately runs **`history.replaceState`** to **`/invite/accept`** (no query string) **before** third-party scripts/analytics run (load accept route with strict asset list; **no** token in `localStorage` / `sessionStorage`; see §12).
3. All server communication uses **POST body** only.

**Referrer / logging**

- Accept layout: HTTP header **`Referrer-Policy: no-referrer`** (or `strict-origin-when-cross-origin` minimum on that route).
- **Logging rule (mandatory):** the **raw invite token must NEVER appear** in application logs, APM, error reports, or stdout. Permitted: `invitationId`, full **`tokenHash`** (or first **8** hex chars **only** as a correlation hint — choose one convention repo-wide), **SHA-256(`emailNormalized`)** or similar email surrogate, internal failure enums. Request bodies containing tokens **must not** be logged verbatim.

**Rate limiting**

| Target | Strategy |
|--------|----------|
| **Per IP** | Sliding window on `POST /invitations/validate` and `POST /invitations/accept` (e.g. Nest `@Throttle` or reverse proxy). Suggested start: **60 requests / 15 min / IP / endpoint** (tune in prod). |
| **Per token hash bucket** | After computing `SHA-256(token)` **in memory** for lookup, apply a secondary limit keyed by **first 16 chars of token hash** (or full hash): e.g. **max 30 validation attempts per 15 minutes per token hash**. Exceeded → respond as **`{ valid: false }`** (same body as invalid token—**not** a distinct client-visible error). |
| **Accept** | Same IP limits + stricter per-hash **accept** attempts (e.g. **10 / hour / hash**) to slow password guessing tied to a token. |

**Max validation attempts per token:** **30 failed validations per rolling 15 minutes per token hash** (config via env `INVITE_VALIDATE_MAX_PER_HASH_WINDOW`). **Successful validation does not** increment failure counter. Lockout is **not** persisted forever—window-based only.

**Password**

- Match existing auth module policy (length, complexity); hash algorithm **identical** to current login.

**Authorization**

- All `/admin/invitations/*` → **ADMIN** JWT guard.
- Public invite routes → **no** auth; rate limits mandatory.

---

### 6. Admin UX / Workflow Plan

- **Admin → Users** → **Add new user** → modal or `/admin/users/invite`.
- **Fields:** email, **name** (required), role, conditional scope UI per §4 matrix.
- **ADMIN role:** no studio/department/market/team fields in form.
- **Submit** → `POST /admin/invitations` → enqueues email (§11) → toast success.
- **Pending invites** table: resend, regenerate, revoke (semantics §8–9).
- Errors: structured codes for **admin-only** endpoints (`EMAIL_IN_USE`, `PENDING_EXISTS`, `INVITE_RESEND_LIMIT`, validation errors). Never leak whether an email had an invite on **public** endpoints.

---

### 7. Invite Acceptance Flow

**Route:** `/invite/accept` (optionally seed `?token=` **once** from email; stripped immediately per §5).

**Client sequence**

1. Obtain token from URL **once** (if present); if missing and no in-memory token for this session, show generic failure state.
2. **`POST /invitations/validate`** with `{ token }`.
3. If `valid: true`, render read-only summary + password form. **Do not** display token. **Clear** token variable from JS memory after successful validate + after accept (see §12 Frontend token rules).
4. **`POST /invitations/accept`** with `{ token, password }`.
5. On `201`, redirect to `/login?invited=1` (email **not** required in query if avoidable—prefer flash/state from same tab only without persisting secrets).

**Server acceptance transaction (mandatory shape)**

The entire accept flow is **one Prisma `$transaction`**: an **atomic, all-or-nothing** operation. Rely on **`SELECT … FOR UPDATE`** on the invitation row, **`UNIQUE(users.email)`**, and transactional writes—**do not** require a specific Prisma isolation level override unless load testing proves a need; default connection isolation + row lock is sufficient when all steps run inside the same callback.

1. **`SELECT * FROM user_invitations WHERE token_hash = $h FOR UPDATE`** (or Prisma equivalent with row lock).
2. **Row gates:** `status === PENDING`; **not** revoked; **expiration:** invite is invalid iff **`expiresAt <= now()`** (server clock, UTC). If invalid → abort txn / return generic failure (validate path uses the same rule **before** returning `valid: true`).
3. **Collision check:** if `users` has no `email_normalized` column, use **`lower(trim(email)) = invitation.emailNormalized`** (or equivalent) inside the txn; optional `FOR UPDATE` on user row if feasible. **`UNIQUE(users.email)`** must hold; persist `User.email` per §3 normalization.
4. **`UsersService.createFromInvitationPayload(...)`** — **single** internal method: insert `User` (password hash, `name = seedName`, `role`, null `marketId`/`teamId` for all v1 invites per §4), then junction rows.
5. Update invitation: `status = ACCEPTED`, `acceptedAt = now()`, `createdUserId = user.id`.
6. **Commit.**

**Expiration checks:** run **identical** `expiresAt <= now()` logic in **`POST /invitations/validate`** (before returning success payload) **and again inside the accept transaction** after locking the row (TOCTOU protection).

**Failure / rollback**

- **Any** thrown error or constraint violation before commit → **full rollback** — **no** partial `User`, **no** partial junction rows; invitation remains **`PENDING`** with unchanged `tokenHash` (accept never mutates token).
- **Concurrent or duplicate accept:** second request may hit **`status !== PENDING`** after first commit, or **`UNIQUE(users.email)`** violation if races occur. **Public response:** **always** the same **`INVITE_INVALID`** / generic UX as every other failure (**do not** return “user already exists” or “already completed”). **Logs only:** `INVITE_ALREADY_ACCEPTED`, `EMAIL_COLLISION`, etc.
- **Duplicate email** (unique violation) mid-flight → rollback; **same** public accept failure contract; log **EMAIL_COLLISION**.
- **`INVITE_ACCEPTED` audit** emitted **only** after successful commit (same process or outbox—see §13 audit table).

**Public failure UX (enumeration-safe — mandatory)**

All of the following **must** produce the **same** user-visible outcome; only **server logs + audit** carry the specific reason.

| Internal state / reason | `POST /invitations/validate` | `POST /invitations/accept` |
|-------------------------|------------------------------|----------------------------|
| Expired invite | `{ "valid": false }` | `400` + `{ "success": false, "errorCode": "INVITE_INVALID" }` |
| Revoked invite | `{ "valid": false }` | same |
| Already accepted (`ACCEPTED`) | `{ "valid": false }` | same |
| Invalid / unknown token (hash miss) | `{ "valid": false }` | same |
| Rate limit (per §5) | `{ "valid": false }` | same (or `400` + `INVITE_INVALID` — **identical message copy**) |
| Password validation failed | N/A | same accept failure contract |
| Duplicate accept / user exists (race) | N/A | same accept failure contract — **must not** reveal user existence |

**Exact user-facing copy (v1):** implement one string constant in web + API docs, e.g.: *"This invitation link is invalid or has expired. Contact your administrator for a new invite."* **Do not** vary wording by failure type on the client.

**Frontend:** render that copy for resolve failures after validate, and for accept errors; no “debug” hints.

---

### 8. Duplicate / Conflict Handling Rules

| Scenario | Behavior |
|----------|----------|
| Active or inactive **User** with same email | **409** on create invite; code `EMAIL_IN_USE`. |
| **PENDING** invite already exists for email | **409**; code `PENDING_INVITE_EXISTS`. **DB partial unique** guarantees race safety. |
| **Resend** (§9) | Same token/expiry/version; enqueue email; subject to **`INVITE_MAX_RESENDS_PER_DAY`** (§14). |
| **Regenerate** | New random token → new `tokenHash`, **`expiresAt` recomputed from now**, `tokenVersion += 1`, enqueue email; prior link **dead immediately**. |
| **Revoke** | `status = REVOKED`, `revokedAt = now()`. |
| **Accept** on already **ACCEPTED** | Txn or pre-check → generic public error; log `INVITE_ALREADY_ACCEPTED`. |
| **Concurrent accept** | Second txn: invite not `PENDING` or unique `users.email` violation → **full rollback**; **same** public message as §7 (**no** “already registered” / “already used” text); log internally. |

**Admin changes scope after send:** v1 — **revoke + create new invite**; **no** in-place edit of `PENDING` payload.

---

### 9. Admin Lifecycle Controls

| Action | Semantics |
|--------|-----------|
| **Resend** | **Only** re-queue email with **same** magic link (same token). Updates `lastSentAt`, increments `sendCount`. **Does not** extend `expiresAt`. **Throttle (mandatory):** max **5** resends per invite per rolling **24 hours**, enforced in **`InvitationService`** before enqueue. Exceeded → **`429`** (or **`400`**) with structured admin-only code **`INVITE_RESEND_LIMIT`** (or equivalent); **not** applicable to public routes. |
| **Regenerate** | New token + **new** `expiresAt` from policy + `tokenVersion++`. Old link unusable. Enqueues email. Counts toward send throttles. |
| **Revoke** | Immediate invalidation. |

**List/filter:** `GET /admin/invitations?status=&page=`  
**History:** `ACCEPTED` rows retained indefinitely for audit.

---

### 10. Architecture / Module Ownership Recommendation

| Owner | Responsibility |
|--------|------------------|
| **`InvitationService`** | Token mint/hash/verify helpers; invite CRUD; **validate** + **accept** orchestration; resend/regenerate/revoke; enqueue email jobs; **all** invite state transitions; enforces §4 matrix **before** persistence. |
| **`UsersService`** (or one **`provisionUserFromInvite`**) | **User row + junction inserts only**; **no** token logic; **no** invite status updates; called **only** from `InvitationService.accept` inside the transaction. **No duplicated** user-creation paths—existing “create user” behavior must delegate to this helper if reused elsewhere later. |
| **`InvitationsController`** | Thin: DTO parse → service; **no** business rules. |
| **BullMQ processor** | Sends Postmark email; **`InvitationService` does not block HTTP on send** in production (§11). |

**Rule:** If user creation logic appears in two places, implementation **fails review**.

---

### 11. API / Backend Plan

**Response contracts (exact)**

`POST /invitations/validate`  
**Body:** `ValidateInvitationDto`  
**200 OK:**

```json
{
  "valid": true,
  "expiresAt": "2026-04-05T12:00:00.000Z",
  "emailMasked": "j***@example.com",
  "roleLabel": "Studio User",
  "name": "Jordan Smith",
  "scopeSummary": "Default: Downtown; Additional: Midtown"
}
```

**Note:** `scopeSummary` is human-readable labels only; **no** raw IDs unless deemed non-sensitive—**default** string built server-side from studio names / department labels.

**Any invalid / expired / revoked / accepted / rate-limited (public-facing enumeration-safe):**

```json
{ "valid": false }
```

**v1 decision:** `POST /invitations/validate` **always returns HTTP 200**. Failure cases (invalid, expired, revoked, accepted, rate-limited, malformed body) return **`{ "valid": false }`** with **no** additional fields that reveal cause. This avoids status-code fingerprinting.

`POST /invitations/accept`  
**Body:** `AcceptInvitationDto`  
**201 Created:**

```json
{ "success": true }
```

**Any failure** (invalid token state, password validation, DB error): **400** with body:

```json
{ "success": false, "errorCode": "INVITE_INVALID" }
```

(`errorCode` is **single** generic code for all failure modes; details **logs only**.)

**Admin routes** (unchanged paths; structured `4xx/409` with specific codes allowed):

| Method | Path |
|--------|------|
| `POST` | `/admin/invitations` |
| `GET` | `/admin/invitations` |
| `POST` | `/admin/invitations/:id/resend` |
| `POST` | `/admin/invitations/:id/regenerate` |
| `POST` | `/admin/invitations/:id/revoke` |

**Email sending architecture**

- **Production:** **`MUST`** enqueue **BullMQ** job (`invite-email-dispatch`) on create/resend/regenerate. HTTP handler returns **after** DB write + **enqueue**, **not** after Postmark round-trip.
- **Development:** may allow sync send behind `NODE_ENV !== 'production'` **only** if `INVITE_EMAIL_SYNC_DEV=true` for convenience; default dev still **prefers queue** for parity.

---

### 12. Frontend Plan

**Admin:** Wire real API; pending invites table.

**Acceptance page (`/invite/accept`):**

| Rule | Detail |
|------|--------|
| Storage | **Never** persist token in `localStorage`, `sessionStorage`, or cookies. |
| Memory | Hold token in a **module-scoped or component ref** only until `validate` + `accept` complete; then **overwrite reference** (`null`). |
| UI | **Never** render token string. |
| Routing | After reading query token, **`replaceState`** to path **without** query; **no** `router.push` with token in query thereafter. |
| Analytics | **No** pageview/event payload containing token or full email. |
| Meta | `robots`: **noindex**. |

**Name display:** show `name` from validate response **read-only**; no input.

---

### 13. Validation / Authorization Requirements

**DTOs (Nest + `class-validator`) — required**

| DTO | Fields | Rules |
|-----|--------|--------|
| **`CreateInvitationDto`** | `email`, `seedName`, `assignedRole`, optional `departmentCodes[]`, `defaultStudioId`, `additionalStudioIds[]` | `email`: `@IsEmail` + **`emailNormalized` per §3** in `@Transform` before service. `seedName`: `@IsString` `@MinLength(1)` `@MaxLength(200)` (tune). `assignedRole`: `@IsEnum(Role)`. Departments: each `@IsEnum(Department)` when role is DEPT user. Studios: `@IsUUID` or internal ID format per schema. **Cross-field:** validate §4 in service **again** after DTO (defense in depth). |
| **`ValidateInvitationDto`** | `token` | `@IsString` `@MinLength(32)` `@MaxLength(200)` (bounds to mitigate abuse). |
| **`AcceptInvitationDto`** | `token`, `password` | Token as above. Password: reuse shared `@Match` policy DTO or pipe to same validator as password-reset if exists (`@MinLength` etc.). |

**Authorization:** ADMIN-only admin routes; public routes rate-limited.

**Mandatory audit events** (`AuditLog` or equivalent). Every row **must** include: `invitationId`, **ISO `timestamp`**, **email hash** (normalized email or SHA-256 thereof — never log raw token). Include **`actorId`** for admin-driven actions; for `INVITE_ACCEPTED`, use **`metadata.newUserId`** and document `actorId` convention (e.g. system/null).

| Event | When | Required fields |
|-------|------|------------------|
| **`INVITE_CREATED`** | Invite persisted + enqueue succeeded | `actorId`, `invitationId`, email hash, `timestamp`, `metadata`: `{ role }` |
| **`INVITE_RESENT`** | Resend enqueue succeeded | `actorId`, `invitationId`, email hash, `timestamp`, `metadata`: `{ sendCount }` |
| **`INVITE_REGENERATED`** | Regenerate txn committed | `actorId`, `invitationId`, email hash, `timestamp`, `metadata`: `{ tokenVersion }` |
| **`INVITE_REVOKED`** | Revoke txn committed | `actorId`, `invitationId`, email hash, `timestamp` |
| **`INVITE_ACCEPTED`** | Accept txn committed | `invitationId`, email hash, `timestamp`, `metadata`: `{ newUserId }` |

**Observability:** Structured JSON logs; **never** raw token; internal failure reason enums for validate/accept (`EXPIRED`, `REVOKED`, `BAD_HASH`, `ALREADY_ACCEPTED`, …).

---

### 14. Rollout / Migration Considerations

1. Migration: `user_invitations` table + **partial unique index** (§3) + **`token_hash` index** (§3) + FKs.
2. **Environment variables (authoritative list for invite feature):**

| Variable | Purpose |
|----------|---------|
| `WEB_PUBLIC_URL` | Origin for invite email links (e.g. `https://tickets.company.com`); **no** trailing path. |
| `INVITE_TOKEN_TTL_DAYS` | Default lifetime for new/regenerated invites; `expiresAt = now() + this many days`. |
| `INVITE_MAX_RESENDS_PER_DAY` | Max **Resend** actions per invitation per rolling **24h** (default **5** in service if unset — document default in code comment). |
| `INVITE_VALIDATE_MAX_PER_HASH_WINDOW` | Max failed **validate** attempts per token-hash bucket per rolling window (see §5; wire numeric value + window length in implementation). |

Additional ops vars (queue names, Postmark keys) follow existing app conventions — **not** duplicated here.

3. Postmark templates: link points to `/invite/accept?token=...`.
4. Feature flag optional.
5. SSO: later passwordless branch does not change invite **provisioning** model.

---

### 15. Risks / Tradeoffs

| Item | Mitigation |
|------|------------|
| Token in email URL | One-time strip + POST-only API; short TTL; `Referrer-Policy`. |
| Email link bookmark without query after strip | User must complete flow in same session or re-open from email—acceptable. |
| ADMIN without market/team at invite | Set later via admin; explicit v1 tradeoff for clarity. |
| Validate returns 200 for failures | Hides enumeration; monitor metrics on `valid:false` ratio. |

---

### 16. Acceptance Criteria

- [ ] **No** HTTP endpoint accepts invite token via GET query for validate/accept.
- [ ] Partial **unique** index enforces one **PENDING** invite per `email_normalized`.
- [ ] Resend vs Regenerate behaves **exactly** as §8–9.
- [ ] Accept flow uses **one transaction** with **`SELECT … FOR UPDATE`** on invite + rollback on any failure; `users.email` unique enforced.
- [ ] ADMIN invites **cannot** set studio, department, market, or team on invite row; user created with null market/team.
- [ ] §4 matrix covered by unit tests + integration tests.
- [ ] DTOs + `class-validator` on all public/admin invite bodies.
- [ ] All **five** audit events emitted with required fields.
- [ ] Production path never blocks HTTP on email send (**BullMQ**).
- [ ] Accept page: no token in storage, UI, or URL after initial strip; POST-only API use.
- [ ] Invitee **cannot** change name.
- [ ] All invalid accept states return **same** public contract; internal logs distinguish.
- [ ] **`token_hash`** index exists; invite token = **256-bit** random; **`tokenHash = SHA-256`** with **constant-time** compare; **no** bcrypt on tokens.
- [ ] **`expiresAt <= now()`** enforced on validate **and** inside accept txn.
- [ ] **`emailNormalized = trim().toLowerCase()`** on all writes and comparisons.
- [ ] Resend throttled to **`INVITE_MAX_RESENDS_PER_DAY`** with **`INVITE_RESEND_LIMIT`** when exceeded.
- [ ] **No** raw invite token in logs or APM.

---

### 17. Verification Plan

1. **Unit:** `InvitationService` — matrix R-* rules, resend/regenerate invariants, token hash, rate-limit helper.
2. **Integration:** Supertest — create (admin), validate/accept public; concurrency (two accepts); regenerate invalidates old hash; partial unique index violation on double pending.
3. **Transaction:** Force failure after user insert (test double) → invite still `PENDING`.
4. **E2E:** Mail catcher → extract URL → accept page strips query → only POST in network tab.
5. **Security:** Burp/zap on validate/accept; confirm no token in server access logs (sample).
6. **Audit:** Assert five event types emitted with required fields on each action.

---

**Document owner:** Platform engineering  
**Revision:** v1.2 — final pre-implementation hardening applied.

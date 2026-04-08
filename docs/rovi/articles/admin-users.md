---
slug: admin-users
title: "Users admin (invites, roles, departments, studio scopes)"
feature: "Users"
roles: [ADMIN]
primary_routes:
  - /admin/users
related_routes:
  - /admin/markets
  - /admin/workflow-templates
synonyms:
  - users
  - user admin
  - user management
  - invite user
  - invitation
  - invitations
  - resend invite
  - revoke invite
  - user roles
  - department user
  - studio user
  - scope studios
  - multi studio
  - studio visibility
  - default location
summary: "Admin hub for provisioning users: invite, accept, resend, revoke, role assignment, departments, and multi-studio visibility."
---

# Users admin (invites, roles, departments, studio scopes)

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/users.

## What it does
/admin/users is closed provisioning: you invite people by email, they
accept by clicking a one-time token link, and their account is created
with the role and scope you specified. Nothing is self-service.

The page also lets you edit an existing user's role, departments, and
studio visibility at any time.

## Steps (invite a user)
1. Open /admin/users.
2. Click **Invite user** (top-right).
3. Fill: name, email, role (STUDIO_USER, DEPARTMENT_USER, or ADMIN),
   home market/studio, departments (multi-select for
   DEPARTMENT_USER), and additional allowed studios for STUDIO_USER
   with multi-location access.
4. Click **Send invite**. Rovi enqueues an `invite-email` job; the
   invitee gets a branded email with an accept link. The invite row
   shows status PENDING with a resend button.
5. Resend or revoke the invitation at any time from the row actions.
   Accepted invites become real users automatically.

## Steps (edit an existing user)
1. Open /admin/users and click the user row.
2. Change role, default studio, departments, or allowed studios.
3. Save. Changes take effect on the user's next request (JWT refresh).

## Roles at a glance
- **STUDIO_USER** — portal home, own tickets, handbook. Cannot manage
  subtasks or transition status.
- **DEPARTMENT_USER** — full ticket feed, dashboard, inbox topic
  folders for their department, assistant. Can manage tickets and
  subtasks per department permissions.
- **ADMIN** — everything above plus the full /admin menu.

## Common pitfalls
- Giving a studio user multiple allowed studios also enables the
  location filter in /portal → Dashboard tab automatically.
- Downgrading a DEPARTMENT_USER to STUDIO_USER removes their access
  to /tickets and /inbox immediately.

## Related
- /admin/markets — where the studios live
- /admin/workflow-templates — department assignments reference these
  department rows

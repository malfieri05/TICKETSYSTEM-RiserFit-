---
slug: admin-lease-iq
title: "Lease IQ (admin)"
feature: "Lease IQ"
roles: [ADMIN]
primary_routes:
  - /admin/lease-iq
related_routes:
  - /admin/markets
  - /admin/workflow-templates
  - /tickets
synonyms:
  - lease iq
  - leaseiq
  - lease-iq
  - lease rules
  - lease rule sets
  - lease source
  - lease pdf
  - landlord rules
  - lease obligations
  - lease evaluation
  - lease compliance
summary: "Per-studio lease intelligence: upload lease PDFs, define rule sets, and evaluate tickets against landlord obligations."
---

# Lease IQ (admin)

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/lease-iq.

## What it does
Lease IQ is the admin tool for tracking per-studio lease obligations and
running automatic compliance checks against incoming maintenance
tickets. For each studio you upload the lease (PDF or structured source),
define a set of rules ("HVAC is the landlord's responsibility if the
unit is over 10 years old"), and Lease IQ evaluates new tickets against
those rules to surface who should pay and what the lease says.

## Components
- **Lease sources** — one per studio. Typically a lease PDF uploaded to
  S3; Rovi also supports structured sources for multi-unit templates.
- **Rule sets** — named groupings of rules attached to one or more
  studios. A rule set can be "draft" or "published".
- **Rules** — individual obligations with a category scope (HVAC,
  Plumbing, Roof, Electrical…), a responsible party (Landlord, Tenant,
  Shared), and optional terms.
- **Ticket evaluations** — every evaluated ticket stores its Lease IQ
  result (rule hit, responsible party, confidence) for audit.

## Steps (attach a lease to a studio)
1. Open /admin/lease-iq.
2. Find the studio in the list (search by name or market).
3. Click **Add source** and upload the lease PDF (or pick an existing
   shared source).
4. Attach or create a rule set. Use the rule editor to add rules with
   category scope, party, and any free-text terms.
5. Mark the rule set **Published** when ready. Only published rule
   sets are used to evaluate tickets.

## Steps (evaluate a ticket)
1. Open any maintenance ticket for a studio with a published rule set.
2. The Lease IQ panel in the drawer shows matching rules, responsible
   party, and a confidence score.
3. Use the result to inform your dispatch decision (landlord vs
   in-house vs tenant-paid vendor).

## Common pitfalls
- Lease IQ only evaluates tickets at studios that have a **published**
  rule set. Draft rule sets are ignored.
- Responsibility results are advisory — always confirm against the
  real lease before invoicing.

## Related
- /admin/markets — where studios are defined
- /admin/workflow-templates — branch your workflow based on Lease IQ
- /tickets — see the Lease IQ panel in the ticket drawer

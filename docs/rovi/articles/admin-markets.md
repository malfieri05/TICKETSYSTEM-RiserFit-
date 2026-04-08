---
slug: admin-markets
title: "Locations (markets and studios) admin"
feature: "Locations"
roles: [ADMIN]
primary_routes:
  - /admin/markets
related_routes:
  - /locations
  - /admin/users
  - /admin/dispatch
synonyms:
  - markets
  - studios
  - locations
  - location admin
  - market admin
  - studio admin
  - geographic
  - map view
  - location list
summary: "Admin hub for the Market → Studio hierarchy: add markets, add studios, set coordinates and addresses, and open per-studio profiles."
---

# Locations (markets and studios) admin

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/markets.

## What it does
/admin/markets is where the Market → Studio hierarchy lives. Every
studio belongs to a market; every ticket, user, and dispatch group is
scoped by this hierarchy. The page gives you both a flat list and a
map view so you can audit coverage geographically.

## Steps
1. Open /admin/markets.
2. Use the search box or the market filter to find a market or studio.
3. Click a market to expand its studios; click a studio row to open the
   studio editor on the right.
4. In the editor set: name, external code, full formatted address,
   latitude/longitude (used by the dispatch map and SLA map views),
   and activation status.
5. Click **Open profile** to jump to /locations/{studioId} — the public
   studio profile page with the per-studio ticket feed.

## Studio profiles
Profiles at /locations/{studioId} are a read-friendly view of a studio:
operational notes (when configured), map pin, recent tickets, and the
same ticket drawer as the main feed. Both admins and studio users can
land there from a ticket context.

## Common pitfalls
- Studios with missing lat/lng don't render on the dispatch map.
- Moving a studio to a different market re-scopes the studio's users
  and changes which dispatch groups they can join. Rovi warns you
  before saving.

## Related
- /admin/users — assign users to studios (including multi-studio scope)
- /admin/dispatch — studio-centric vendor dispatch
- /locations — studio profile pages

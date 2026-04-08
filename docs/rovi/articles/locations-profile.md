---
slug: locations-profile
title: "Studio location profile pages"
feature: "Location profile"
roles: [STUDIO_USER, DEPARTMENT_USER, ADMIN]
primary_routes:
  - /locations
related_routes:
  - /admin/markets
  - /tickets
  - /admin/dispatch
synonyms:
  - location profile
  - studio profile
  - location page
  - studio page
  - per studio view
  - studio details
summary: "Per-studio profile page with operational details, map pin, and the studio's ticket feed."
---

# Studio location profile pages

**Who can use this:** everyone (scoped to studios they are allowed to see).
**Where to find it:** /locations/{studioId} — reachable from a ticket's
studio chip, the locations admin, or /admin/dispatch.

## What it does
A location profile is the single page about one studio. It shows:

- **Studio header** — name, formatted address, market, external code.
- **Map pin** — the studio plotted on a small Leaflet map.
- **Operational notes** — keyholder, hours, vendor preferences (when
  the admin has populated the studio profile).
- **Tickets at this studio** — the same ticket drawer behavior as
  /tickets, filtered to this studio's scope.

## Steps
1. Open /locations (or jump directly to /locations/{studioId} from a
   ticket or the dispatch map).
2. Read the studio header and any operational notes.
3. Scroll the tickets list and click any row to open the ticket drawer
   without leaving the profile.

## Common pitfalls
- Studio users only see profiles for studios they are scoped to.
- Profile content (notes, keyholder, hours) is optional — empty
  sections don't render.

## Related
- /admin/markets — where studios and profiles are edited (admin)
- /tickets — the main ticket feed
- /admin/dispatch — the dispatch map uses the same coordinates

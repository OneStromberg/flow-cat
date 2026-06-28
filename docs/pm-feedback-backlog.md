# PM Feedback Backlog (2026-06-28)

Source: product-manager review (Russian). Triaged into Batch 1 (bugs/quick wins — fix first) and Batch 2 (features). Decisions from brainstorming recorded inline.

## Batch 1 — Bugs & quick wins (testing blockers)

| # | Item | Plan |
|---|---|---|
| B1 | **Phone normalization** (1.2): `972`/`+972`/`05x`/dashes must canonicalize to ONE value or login breaks. | `normalizePhone`: leading `0` → `972`+rest; `972`/`+972`/`00` → `972…`. Israeli canonical. Update tests. |
| B2 | **Login phone hint** (#0/1.2): show expected format on the login form. | Helper text under the phone input. |
| B3 | **Worker default landing = Check-in** (#1). | `/app` → redirect to `/app/checkin`; move Hours to `/app/hours`; WorkerNav updated. |
| B4 | **Re-check-in after checkout** (#3): currently blocked. | Show "Check in" whenever no OPEN record exists (even if a prior CLOSED one does). Data layer already allows it (rejects only double-OPEN). |
| B5 | **Show actual check-in/out times** (#2): checkout shows only nominal `08:00–14:30`. | On a closed record show actual `checkInAt → checkOutAt` + hours. |
| B6 | **Checked-out shift not in Hours** (#4). | Surface the worker's Attendance (date · location · in/out · hours) in the Hours view. |
| B7 | **Attendance fields** (4.2): add **location** + **worker name**, hide Instance ID. | Join instanceId→location, phone→worker name in the attendance page. |
| B8 | **Shift status colors + legend** (2.4): 🟢 assigned · 🟡 unassigned+upcoming · 🔴 unassigned+ongoing · ⚪ cancelled. | Replace color-by-location with a `shiftStatus(instance,assigned,now)` helper; add a legend; apply to month/week/day. |
| B9 | **Payroll default structure** (5.1/5.2): `payStructure ?? 'hourly'` lets empty string through → flat pay. | Use `payStructure || 'hourly'`. NOTE: Ilya's 37₪-flat is because his structure is **Monthly**; fix via worker card (B2-feature) or sheet. |
| B10 | **Week starts Sunday** (2.2): align template weekday-checkbox order to Sun-first (calendar already is). | Reorder display only. |

No action: 1.1 gender "other" (keep). 4.1 Attendance = button check-ins by design; manual entries live in Hours (confirmed split).

## Batch 2 — Features (decided)

| # | Item | Decision |
|---|---|---|
| F1 | **Worker card / detail page** (1.4) | New `/admin/workers/[phone]` — view contacts + **edit** worker (incl. pay structure → fixes Ilya). Also a tel: contact link. |
| F2 | **City dropdown** (1.3) | City as a dropdown from a managed list (distinct existing + a `Cities` tab the PM edits in the sheet); free-type still allowed but warns. Prevents בת ים/בת-ים dupes. |
| F3 | **Shift instructions / roles** (2.5) | Shift template gains an `instructions` text field (one location can have shifts with different tasks: guard 1, guard 2, sayar). Shown to the assigned worker on check-in. |
| F4 | **Per-day weekly times + recurrence** (2.1) | Template becomes a 7-day schedule (each weekday its own on/off + start–end); recurrence = **Forever / N weeks / Valid from–to**. Replaces same-time-all-days. Big model change (affects generator/edit/copy/views). |
| F5 | **Place by pin/coords + description** (3.1) | Add-place keeps Google autocomplete PLUS drop-a-pin / raw lat,lng + free-text description (e.g. "tractor in a field"). |
| F6 | **Copy-to-location** (2.3) | Replace copy-to-period with "Duplicate shift to another location" (same days/times/instructions, pick a different site). |

## Build order
Batch 1 first (unblocks PM testing) → then Batch 2: F1 (worker card, also fixes Ilya) → F3 (instructions) → F2 (city) → F5/F6 (places + copy) → F4 (per-day schedule — biggest, last).

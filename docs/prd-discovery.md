# FlowCat — Attendance + Payroll PRD Discovery

**Status:** Answered (2026-06-24). Built on top of the shipped POC (Next.js on Vercel, Google Sheets DB, GCP platform, worker auth + admin + places/worklog). Decisions below drive per-subsystem spec → plan → build, in the order at the bottom.

---

## 0. Cross-cutting (settled)

- **0A — Storage:** **Sheets only.** No rollover/archival yet. Any future storage change is a separate process (dump + migration), out of scope here.
- **0B — Client:** **Web only** (no mobile/PWA/native). All notifications via **Telegram Bot**.
- **0C — Messaging:** **Telegram Bot** (replaces the parked WhatsApp bot for this product). **Convention:** every automated/scheduled job (shift generator, alert poller, nightly backup) reports a run summary to admins via Telegram. A minimal outbound `notifyAdmins(text)` helper (env `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_IDS`) is built in Phase 1b; the full bot (worker linking, broadcasts) lands in Phase 4.
- **0D — Roles:** **worker + admin** only (no separate manager tier; "supervisor/manager" in the PRD = admin).
- **0E — Languages:** **English / Russian / Hebrew** (Hebrew ⇒ RTL).
- **0F — Time:** Single timezone **Asia/Jerusalem**. Confirmed.

---

## Core Requirements

### 1. Employee Database
- **Add `gender`** field.
- **Soft delete** (keep terminated staff for reporting; never hard-delete).
- Access: **admins** see all; **users** see **only their own unlocked data** (row-lock concept, same as locked worklog entries).
- Storage: **Sheets only** for now.
- Existing fields stay (phone, name, teudat, places, city, age, transportation, hebrew_level, pay_type, pay_amount, schedule, admin).

### 2. Locations / Shifts Database
- Shifts are **ad-hoc but reusable** for weeks/months → modeled as **recurring templates that generate dated instances**.
- All proposed location fields in scope (owning client, required headcount per shift, geofence radius, site contact, pay-rate override, notes, required attributes).
- One location can have **multiple concurrent shifts**.
- **Shifts are their own table** (template table + generated dated-instance rows).

### 3. Staff Scheduling & Filtering
- **Full filter list (confirmed):** gender, age (range), city, vehicle ownership (`transportation` ≠ "nothing"), hebrew_level, pay_type, schedule, assigned places/locations, free-text search.
- Assignment is **open-ended** ("works here") — not bound to a single dated shift.
- Employee can be assigned to **multiple locations** (already true) and **multiple shifts**.
- **Admin assigns** (no manager self-assign for now).

### 4. Flexible Scheduling
- Supports **(a)** per-day variable hours, **(b)** rotating patterns, **(c)** split shifts, **(d)** open shifts workers can claim, **(e)** drag-to-reschedule on the dashboard.
- Schedules set **per employee AND per location** (both).
- Horizon: **weekly + monthly**; schedules **repeat automatically** (via the recurring templates from bullet 2).
- Workers can **request schedule changes**.

### 5. Payroll & Adjustments
- **Rate = combination with precedence** (e.g. employee override > shift-type > location base — exact order TBD in spec).
- Payment structures: **hourly / fixed per-shift / per-day / monthly salary / piece (per task)**.
- **Bonuses/penalties:** admin-entered, free-form amount + reason + date, attached to an **employee** and a **pay period**.
- **Pay period:** weekly / bi-weekly / monthly (selectable).
- **Currency: ILS.**

### 6. Leave Management
- **Admin enters** leave directly.
- **Types:** vacation / sick / unpaid / other — **affect payroll**.
- Auto-flag **only the locations/shifts the person was assigned to** during the leave dates.
- Flag surfaced as: **dashboard badge (bullet 12) + a filter + a Telegram alert to admins**.
- **Approve/deny workflow** included.

### 7. Employee Client
- **No mobile client.** **Web client + Telegram bot** only.

### 8. Check-in / Check-out Verification
- **Photo:** stored for **manual review**, in **GCS** (no face-matching).
- **Geofence:** per-location radius with a **default**.
- **GPS** coarse/spoofable is **acceptable** (no anti-spoofing).
- **Forgot to check out:** resolved **manually** by admin.
- ⚠️ **Open:** worked-hours source of truth not yet pinned — see Follow-ups #1.

### 9. Real-time Admin Alerts
- **Scheduler** (Cloud Scheduler → Cloud Function every N min) watching scheduled shifts vs actual check-ins — **OK if cost is low** (it is; see Follow-ups #2).
- **Grace period** before "missed" — **configurable per location**.
- Recipient: **admin via Telegram bot**.
- Alert content: employee name, location, expected time, **call button** (bullet 10), optional map link.
- **Escalation if unacknowledged: stored** (tracked/persisted).

### 10. Direct Communication
- **Via Telegram bot** (message/contact the worker through the bot rather than a `tel:` dialer).

### 11. Broadcast Notifications
- **Telegram bot.** Targeting: **global / per-user / admin**, with the bullet-3 filters to build segments.

### 12. Scheduling Dashboard
- **Kanban:** columns = locations, cards = assigned workers. **View-only.**
- Time granularity: **day / week / month.**
- Board filters: **by location, by attribute.**

### 13. Interactive Map
- **Google Maps JS** (already loaded) with **per-location markers**.
- Marker click: site name, **headcount status** (staffed/understaffed), assigned workers, **"requiring staff"** flag.
- **Color-code** markers: fully staffed / needs staff / leave-impacted.
- **Show employee locations too** (from last check-in).

### 14. Conflict Detection
- Conflict = **same employee in two time-overlapping shifts**; also flag **assigned during leave** and **exceeding max hours/day or /week**.
- Surface: **soft warning + badge** (no hard block).

### 15. Reporting & Analytics
- Report **generated as a new tab inside the existing Sheet file** (open directly in Google Sheets).
- Grouping/filters: **date range + location + employee.**
- Report types: **(a) hours by employee, (b) hours by location, (c) payroll summary (hours×rate + bonuses − penalties), (d) attendance exceptions (late/missed/out-of-zone).**

### 16. Data Backups
- **Save the Sheet to Google Drive every night** (scheduled copy/export).

---

## UI Specifications

- **U1. Employee Client:** minimal; **no branding yet.**
- **U2. Client Portal:** **out of scope — it's a separate existing project.**

---

## Remaining Follow-ups (RESOLVED 2026-06-24)

1. **Worked-hours source of truth:** ✅ **(a)** — check-in/out timestamps are the **hours of record**; the existing manual hour entry becomes an **admin-only correction** tool. (Drives payroll bullet 5 and reports bullet 15.)

2. **Alert scheduler cost:** ✅ Approved. Cloud Scheduler + small polling Cloud Function (~$0 at this scale).

3. **Telegram linking:** ✅ Confirmed. User opens `t.me/<bot>?start=<token>` to bind their chat_id to their employee row. Bot token (from @BotFather) stored as an env var. **Additional requirement:** on web login, the user sees their **bot-connection status** (connected / not connected) and, if not connected, a **deep link to connect**.

4. **Rate precedence:** ✅ Confirmed — highest wins: **employee-specific rate → shift-type (day/night) → location base**. Structure (hourly / fixed / per-day / monthly / piece) selected per employee.

5. **i18n default:** ✅ Default first-load language = **Russian**, with a switcher to EN/HE. i18n approach confirmed.

6. **"Requiring staff" definition:** ✅ Confirmed — a shift instance is "requiring staff" when **assigned headcount < required headcount** (whether unfilled or leave-impacted). This single rule drives the dashboard badge, the map color, and the dashboard filter.

---

## Suggested Build Order

**Phase 1 (foundations):** §1 Employee DB extension (gender, soft-delete, row access) → §2 Locations + Shift templates/instances → §3 Assignment + filtering.
**Phase 2 (attendance core):** §8 Check-in/out (web, GPS + photo→GCS, geofence) → resolve hours-of-record (Follow-up #1) → §5 Payroll.
**Phase 3 (visibility):** §12 Kanban dashboard → §13 Map → §14 Conflict detection.
**Phase 4 (comms):** Telegram bot foundation (linking) → §9 Alert scheduler → §10 Call/contact → §11 Broadcasts.
**Phase 5:** §6 Leave → §4 Flexible-scheduling extras (claim/drag/requests) → §15 Reports → §16 Nightly Drive backup → §7/U1 polish.

Each subsystem gets its own spec → plan → implementation, same flow as Add Place.

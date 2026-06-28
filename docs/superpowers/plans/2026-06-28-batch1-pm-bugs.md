# Batch 1 — PM Bugs & Quick Wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Fix the testing-blocker bugs + quick wins from the PM review (see `docs/pm-feedback-backlog.md` Batch 1).

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Sheets, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build.
- Identity from session, never body. Mobile-first. Admin-guarded admin pages.
- Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: Israeli phone normalization (B1) + login hint (B2)
**Files:** `packages/worklog-core/src/data/phone.ts` + `phone.test.ts`; `packages/web/app/login/login-form.tsx` (or the login page).

- [ ] **Step 1: Failing tests** in `phone.test.ts` — add:
```ts
test('canonicalizes Israeli numbers to 972…', () => {
  assert.equal(normalizePhone('050-123-4567'), '972501234567');
  assert.equal(normalizePhone('0501234567'), '972501234567');
  assert.equal(normalizePhone('+972 50 123 4567'), '972501234567');
  assert.equal(normalizePhone('00972501234567'), '972501234567');
  assert.equal(normalizePhone('972501234567'), '972501234567');
  assert.equal(normalizePhone('15551230000'), '15551230000'); // non-0-leading untouched
});
```
  (If any EXISTING phone test asserts a `0…`-leading input stays `0…`, update it to the new canonical — the new behavior is intended.)

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement** in `phone.ts`:
```ts
export function normalizePhone(s: string): string {
  let digits = (s ?? '').replace(/\D+/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = '972' + digits.slice(1); // Israeli local → international
  return digits;
}
```
- [ ] **Step 4: Run — worklog-core tests pass** (fix any worker/auth test fixtures that assumed the old behavior).
- [ ] **Step 5: Login hint** — in the login form, add helper text under the phone field: e.g. `Enter your phone — e.g. 050-123-4567 or +972 50 123 4567`. READ the login form file first.
- [ ] **Step 6: Verify** worklog-core tests + web build. Commit `fix: Israeli phone canonicalization + login format hint`.

---

### Task 2: Worker default landing = Check-in (B3) + Attendance in Hours (B6)
**Files:** Move `packages/web/app/app/page.tsx` → `packages/web/app/app/hours/page.tsx`; create a new `packages/web/app/app/page.tsx` (redirect); modify `packages/web/app/app/worker-nav.tsx`.

- [ ] **Step 1: Move Hours** — relocate the current `/app/page.tsx` (the entry form + worked-hours content) to `/app/hours/page.tsx` (adjust relative import depths: it's now one level deeper — `../../lib` → `../../../lib`, `./logout-button` etc.). Title it "Hours".
- [ ] **Step 2: Redirect `/app`** — new `packages/web/app/app/page.tsx`: `requireWorker()`→`redirect('/login')` if none, else `redirect('/app/checkin')`. `runtime='nodejs'`,`dynamic='force-dynamic'`.
- [ ] **Step 3: Nav** — `worker-nav.tsx`: Hours tab href `/app/hours` (exact match on `/app/hours`); Check-in `/app/checkin`; Profile `/app/profile`. (Remove the old `exact:true` on `/app`.)
- [ ] **Step 4: Attendance in Hours** — in `/app/hours/page.tsx`, also load `listAttendance(gw, { employeePhone: worker.phone })` (most recent first) and, to resolve location, `listInstances(gw, { from:'0000-01-01', to:'9999-12-31' })` mapped `instanceId→location`. Render an **"Attended shifts"** section: each closed/corrected record → `date · location · checkInAt→checkOutAt (times) · {hours}h`. (Keep the existing manual-entry section too.)
- [ ] **Step 5: Verify** typecheck + build (`/app`, `/app/hours` present). Commit `feat(web): worker lands on check-in; Hours shows attended shifts`.

---

### Task 3: Re-check-in after checkout (B4) + actual times on card (B5)
**Files:** `packages/web/app/app/checkin/checkin-client.tsx` (and `checkin/page.tsx` if needed).

- [ ] **Step 1:** In `checkin-client.tsx`, change the per-instance control logic: show **Check out** when an OPEN record exists; otherwise show **Check in** (even when a CLOSED/corrected record exists — this enables re-check-in; the data layer already permits it since it only rejects a second OPEN record). Keep showing the prior completed summary alongside the re-check-in button.
- [ ] **Step 2:** On a closed/corrected record, show the **actual** times: `Checked in {fmt(checkInAt)} → out {fmt(checkOutAt)} · {hours}h` (use the attendance record's `checkInAt`/`checkOutAt`, not the nominal shift start/end). The page already passes the attendance record — ensure `checkInAt`/`checkOutAt` are included in the props (extend the page's mapping if it currently drops them).
- [ ] **Step 3: Verify** typecheck + build. Commit `fix(web): allow re-check-in after checkout; show actual check-in/out times`.

---

### Task 4: Attendance admin — name + location, hide Instance ID (B7)
**Files:** `packages/web/app/admin/attendance/page.tsx` + `attendance-client.tsx`.

- [ ] **Step 1:** In the page, also load `listWorkers` and `listInstances` (wide range); build `phone→name` and `instanceId→location` maps; pass `workerName` + `location` per row to the client.
- [ ] **Step 2:** In `attendance-client.tsx`, replace the **Instance ID** column with **Location** and add a **Worker** (name) column. Keep date/in/out/hours/geofence/photos.
- [ ] **Step 3: Verify** typecheck + build. Commit `feat(web): attendance shows worker name + location, hides instance id`.

---

### Task 5: Shift status colors + legend (B8)
**Files:** `packages/web/app/admin/shifts/shift-colors.ts` (add a status helper); `month-grid.tsx`, `week-columns.tsx`, `day-list.tsx` (use it); add a small legend to each view (or in `view-switcher.tsx`).

- [ ] **Step 1:** In `shift-colors.ts`, add:
```ts
export type ShiftStatusColor = 'green' | 'yellow' | 'red' | 'gray';
/** now = ISO datetime. assigned/headcount + the instance's date+start/end decide the color. */
export function shiftStatusColor(args: { status: string; assigned: number; headcount: number; date: string; start: string; end: string; nowISO: string }): ShiftStatusColor {
  if (args.status === 'cancelled') return 'gray';
  if (args.assigned >= args.headcount) return 'green';           // fully assigned
  // understaffed:
  const startDT = `${args.date}T${args.start}`;
  const endDT = args.end < args.start ? `${addOneDay(args.date)}T${args.end}` : `${args.date}T${args.end}`;
  const now = args.nowISO;
  if (now >= startDT && now <= endDT) return 'red';              // ongoing & unstaffed
  if (now < startDT) return 'yellow';                            // upcoming & unstaffed
  return 'red';                                                  // past & was unstaffed
}
```
  (Add a small `addOneDay(iso)` local; compare as `YYYY-MM-DDTHH:MM` lexicographically — pass `nowISO` sliced to that precision from the page.) Map color→tailwind classes in each view (green=`bg-emerald-500`, yellow=`bg-amber-400`, red=`bg-rose-500`, gray=`bg-gray-300`).
- [ ] **Step 2:** Update `month-grid.tsx`/`week-columns.tsx`/`day-list.tsx` to color chips/cards via `shiftStatusColor` (pass `nowISO` from the page = current Asia/Jerusalem time, or UTC sliced — acceptable approximation). Keep the ⚠ for understaffed.
- [ ] **Step 3:** Add a **legend** row (🟢 Assigned · 🟡 Upcoming, needs staff · 🔴 Ongoing, needs staff · ⚪ Cancelled) under the view switcher.
- [ ] **Step 4: Verify** typecheck + build. Commit `feat(web): status-based shift colors + legend`.

---

### Task 6: Payroll default-structure fix (B9) + Sunday-first weekday order (B10)
**Files:** `packages/web/app/admin/payroll/page.tsx`; the template form(s) (`new/add-template-form.tsx`, `templates/[id]/template-detail.tsx`).

- [ ] **Step 1:** In `payroll/page.tsx`, change `w.payStructure ?? 'hourly'` → `(w.payStructure || 'hourly')` (both the `computePay` call and the row `structure` field) so a blank structure defaults to hourly.
- [ ] **Step 2:** In the template add/edit forms, render the weekday checkboxes in **Sunday-first** order (`Sun, Mon, Tue, Wed, Thu, Fri, Sat`) — display order only; the stored values/`WEEKDAYS` set are unchanged.
- [ ] **Step 3: Verify** typecheck + build + worklog-core tests. Commit `fix(web): payroll defaults blank structure to hourly; Sunday-first weekday order`.

---

## Self-Review Notes
- **Coverage:** B1–B10 each mapped to a task. B4 needs no data-layer change (checkIn already rejects only double-OPEN). B9 is a one-operator fix; the deeper Ilya issue (Monthly vs Hourly) is resolved by the worker card in Batch 2.
- **Tests:** phone normalization is the main new pure logic (Task 1). shiftStatusColor logic (Task 5) — add a small unit test if extracted cleanly.

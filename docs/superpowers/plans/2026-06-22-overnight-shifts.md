# Overnight Shifts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a shift whose finish time is earlier than its start time to be logged as a valid overnight shift (hours computed across midnight), rejecting only identical start/finish times.

**Architecture:** Change the shared `computeHours` (overnight = +24h, identical = invalid) and relax `validateAnswers`' cross-field rule in `@scourage/worklog-core`; update the parked WhatsApp bot's end-time guard message + test to match the new "only identical times are invalid" rule. One task.

**Tech Stack:** TypeScript, Node built-in test runner via `tsx`.

## Global Constraints

- ESM, explicit `.ts` import extensions. Node built-in test runner.
- `computeHours`: `end > start` → normal; `end < start` → +24h overnight; `end == start` → `null`.
- `validateAnswers`: only error is identical start/finish ("Start and finish can't be the same time."); `start > end` validates.
- No shift-length guard, no schedule gating.
- Local commits only — **NEVER run `git push`**.
- ponytail: exactly these edits, nothing else.

---

### Task 1: Overnight computeHours + validation + bot guard

**Files:**
- Modify: `packages/worklog-core/src/time/clock.ts` (`computeHours`)
- Modify: `packages/worklog-core/src/time/clock.test.ts`
- Modify: `packages/worklog-core/src/submit/validate-answers.ts` (cross-field rule)
- Modify: `packages/worklog-core/src/submit/validate-answers.test.ts`
- Modify: `packages/whatsapp-bot/src/conversation/engine.ts` (guard message)
- Modify: `packages/whatsapp-bot/src/conversation/engine.test.ts` (the reject test)

**Interfaces:**
- `computeHours(start: {h,m}, end: {h,m}): number | null` — unchanged signature; overnight semantics.
- `validateAnswers(...)` — unchanged signature; the only time-order error is identical times.

- [ ] **Step 1: Update the failing tests first — `packages/worklog-core/src/time/clock.test.ts`**

Replace the `computeHours` test block (the one asserting `8.5`, the two `null`s) with:
```ts
test('computes hours, overnight across midnight, and rejects identical times', () => {
  assert.equal(computeHours({ h: 8, m: 0 }, { h: 16, m: 30 }), 8.5);   // same-day
  assert.equal(computeHours({ h: 22, m: 0 }, { h: 6, m: 0 }), 8);      // overnight
  assert.equal(computeHours({ h: 23, m: 30 }, { h: 0, m: 30 }), 1);    // overnight across midnight
  assert.equal(computeHours({ h: 17, m: 0 }, { h: 9, m: 0 }), 16);     // overnight (was null)
  assert.equal(computeHours({ h: 9, m: 0 }, { h: 9, m: 0 }), null);    // identical → invalid
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — overnight cases currently return `null`.

- [ ] **Step 3: Implement overnight in `packages/worklog-core/src/time/clock.ts`**

Replace the body of `computeHours` with:
```ts
export function computeHours(
  start: { h: number; m: number },
  end: { h: number; m: number },
): number | null {
  let mins = (end.h * 60 + end.m) - (start.h * 60 + start.m);
  if (mins < 0) mins += 24 * 60; // finish earlier than start → overnight (next day)
  if (mins === 0) return null; // identical start/finish → no shift
  return Math.round((mins / 60) * 100) / 100;
}
```

- [ ] **Step 4: Run — verify clock tests pass**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: the clock test passes (validate-answers test may now fail — next step).

- [ ] **Step 5: Update `packages/worklog-core/src/submit/validate-answers.test.ts`**

Find the test that asserts "end must be after start" (start `16:00`, end `09:00` → `errors.end === 'Finish must be after start'`). Replace that whole `test(...)` with two tests:
```ts
test('start > end is a valid overnight shift (no error)', () => {
  const r = validateAnswers(questions, { place: 'Warehouse', date: '2026-06-19', start: '22:00', end: '06:00' }, worker, tz, now);
  assert.deepEqual(r, { ok: true });
});

test('identical start and finish is rejected', () => {
  const r = validateAnswers(questions, { place: 'Warehouse', date: '2026-06-19', start: '09:00', end: '09:00' }, worker, tz, now);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.end, "Start and finish can't be the same time.");
});
```
(Keep the other existing validate-answers tests unchanged. Note: the first test uses `'22:00'`/`'06:00'` which must NOT trip the future-date or other guards — `date` is `2026-06-19`, a past date relative to the test's `now`, so it stays valid.)

- [ ] **Step 6: Run — verify it fails**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — the new identical-times test fails (current code still says "Finish must be after start" and rejects `22:00→06:00`).

- [ ] **Step 7: Update the cross-field rule in `packages/worklog-core/src/submit/validate-answers.ts`**

Replace the cross-field block:
```ts
  // cross-field: finish after start (only when both parse cleanly)
  const s = parseClockTime(answers['start'] ?? '');
  const e = parseClockTime(answers['end'] ?? '');
  if (s && e && e.h * 60 + e.m <= s.h * 60 + s.m) errors['end'] = 'Finish must be after start';
```
with:
```ts
  // cross-field: identical start/finish is invalid; start > end is a valid overnight shift
  const s = parseClockTime(answers['start'] ?? '');
  const e = parseClockTime(answers['end'] ?? '');
  if (s && e && s.h === e.h && s.m === e.m) errors['end'] = "Start and finish can't be the same time.";
```

- [ ] **Step 8: Run — verify worklog-core passes**

Run: `pnpm --filter @scourage/worklog-core test && pnpm --filter @scourage/worklog-core typecheck`
Expected: PASS.

- [ ] **Step 9: Update the parked bot's guard message — `packages/whatsapp-bot/src/conversation/engine.ts`**

Find the end-time guard inside `handleMessage` (it calls `computeHours(start, end) === null`). Its reply currently reads "Finish time must be after the start time. Please re-enter the finish time (e.g. 16:30)." Replace that string with:
```ts
"Start and finish can't be the same time. Please re-enter the finish time (e.g. 16:30)."
```
(Leave the guard logic — `computeHours(...) === null` — unchanged; with overnight semantics it now fires only on identical times, which is exactly what the new message says.)

- [ ] **Step 10: Update the bot test — `packages/whatsapp-bot/src/conversation/engine.test.ts`**

Find the test named `'finish before start is rejected'`. It sends start `16:00` then end `09:00` and asserts a rejection. That input is now a valid overnight shift, so change the test to assert (a) `16:00 → 09:00` is **accepted** (overnight, computes 16h, reaches the WorkLog), and (b) identical times are rejected. Replace the whole `test('finish before start is rejected', ...)` with:
```ts
test('overnight shift (finish before start) is accepted', async () => {
  const { deps, gateway } = makeDeps();
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_0' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'date_today' });
  await handleMessage(deps, { phone: '15551230000', text: '22:00' });
  await handleMessage(deps, { phone: '15551230000', text: '06:00' });
  const log = gateway.dump().WorkLogs;
  assert.equal(log.length, 2);
  assert.equal(log[1][log[0].indexOf('hours')], '8');
});

test('identical start and finish is rejected', async () => {
  const { deps, sent } = makeDeps();
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_0' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'date_today' });
  await handleMessage(deps, { phone: '15551230000', text: '09:00' });
  await handleMessage(deps, { phone: '15551230000', text: '09:00' });
  assert.match(bodies(sent).join(' '), /same time|can.t be the same/i);
});
```
(Use the same `makeDeps`, `bodies`, and `handleMessage` helpers the file already defines. If the existing reject test referenced `sent`/`gateway` differently, match the file's existing destructuring from `makeDeps()`.)

- [ ] **Step 11: Run the full suite + typecheck**

Run:
```bash
pnpm -r test
pnpm -r typecheck
```
Expected: all PASS (worklog-core overnight + bot overnight-accepted/identical-rejected; web unaffected).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: overnight shifts (finish before start = +24h; only identical times invalid)"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** `computeHours` overnight + identical→null (Step 3); `validateAnswers` identical-only rejection (Step 7); ripple to the parked bot's guard message + test (Steps 9–10); tests for overnight + identical across core and bot (Steps 1, 5, 10).
- **No new files, no new deps, no UI changes** — the worker form + edit form already call the shared core, so overnight works there with zero web changes.
- **Type consistency:** `computeHours` and `validateAnswers` signatures unchanged; only behavior + one message string changed.

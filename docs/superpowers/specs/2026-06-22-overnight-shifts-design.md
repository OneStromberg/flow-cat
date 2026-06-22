# Overnight Shifts — Design Spec

**Date:** 2026-06-22
**Status:** Approved design — ready for implementation plan
**Project:** `flow-cat` (deployed on Vercel)

## 1. Purpose

Let a worker log a shift that crosses midnight — i.e. the **finish time is earlier
than the start time** (e.g. `22:00 → 06:00`). Today this is rejected ("Finish must
be after start"); after this change it's a valid overnight shift whose hours are
computed across midnight.

## 2. The change (one core function + one validation rule)

All hour math lives in `@scourage/worklog-core`, shared by the worker form, the
edit form, and the parked WhatsApp bot — so this single change flows everywhere.

### `computeHours(start, end)` — `packages/worklog-core/src/time/clock.ts`
- `end > start` → normal diff (unchanged).
- `end < start` → **overnight**: add 24h. `22:00 → 06:00` = **8h**; `23:30 → 00:30` = **1h**.
- `end == start` → `null` (a zero-length / ambiguous shift is invalid).

### `validateAnswers` — `packages/worklog-core/src/submit/validate-answers.ts`
- Drop the current "Finish must be after start" rejection.
- The only remaining time-order error is **identical times**: if `start == end`,
  error on the `end` field with "Start and finish can't be the same time."
- Any `start > end` now validates (it's an overnight shift).

## 3. Decisions (locked)

- **No length guard.** Any `start > end` is a valid overnight shift, no maximum.
  (Accepted trade-off: a fat-fingered/swapped day shift would record wrong hours
  until someone notices — the worker is trusted.)
- **No schedule gating.** Any worker can enter an overnight shift regardless of a
  future admin "schedule" field; that field is metadata only, not an entry rule.

## 4. Ripple effects

- **Worker entry + edit forms:** both already call `computeHours`/`validateAnswers`
  via `submitWorklog`/`updateEntry` — no UI change needed; overnight just works.
- **Parked WhatsApp bot:** its `finalize` + end-after-start guard call the same
  `computeHours`; with the new behavior, `end < start` now returns a real value
  (overnight) so the bot accepts it too — consistent. `end == start` still returns
  `null` so the bot still rejects it.

## 5. Testing

- **`clock.test.ts`:** `computeHours` overnight cases — `22:00→06:00 = 8`,
  `23:30→00:30 = 1`, plus `end == start → null`, plus existing same-day cases stay.
- **`validate-answers.test.ts`:** `start > end` passes (no `end` error);
  `start == end` produces the identical-times error; existing valid case stays.
- Any existing test that asserted `end < start → null` / "Finish must be after
  start" is updated to the new overnight behavior.

## 6. Out of scope

- Max-shift-length guard; per-schedule entry restrictions; cross-midnight *date*
  handling (the entry's `date` is the shift's start date as today — unchanged).

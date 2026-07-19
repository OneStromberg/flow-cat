import type { SheetsGateway } from '@scourage/sheets-helper';
import {
  loadQuestions,
  validateQuestions,
  listWorkerEntries,
  listAttendance,
  listInstances,
  todayISO,
  type Question,
  type WorkEntry,
  type Worker,
} from '@scourage/worklog-core';

// NOT imported from `lib/sheets.ts` on purpose — that module is marked
// `server-only`, which throws when loaded outside Next's server-component
// bundler (e.g. this file's own `node --test` unit test). Same constant,
// computed locally so `loadHoursData` stays plain-Node testable.
const COMPANY_TZ = process.env.COMPANY_TIMEZONE ?? 'UTC';

export interface AttendedRow {
  id: string;
  date: string;
  location: string;
  checkInAt: string;
  checkOutAt: string;
  hours: string;
}

export interface HoursData {
  questions: Question[];
  questionsValid: boolean;
  hasPlaces: boolean;
  /** Worker's assigned place names — needed client-side to build the `worker_places` widget. */
  places: string[];
  entries: WorkEntry[];
  totalHours: number;
  attended: AttendedRow[];
  /** Company-timezone "today" (server-computed) — the EntryForm date field must not drift to the browser's local date. */
  today: string;
}

/**
 * Loads everything the Hours screen needs, pre-resolved to plain JSON so the
 * client only has to render — no Firestore/Sheets access happens client-side.
 */
export async function loadHoursData(gw: SheetsGateway, worker: Worker): Promise<HoursData> {
  const questions = await loadQuestions(gw);
  const questionsValid = validateQuestions(questions).ok;

  const entries = await listWorkerEntries(gw, worker.phone);
  const totalHours = entries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);

  const attendanceRecords = await listAttendance(gw, { employeePhone: worker.phone });
  const closedAttendance = attendanceRecords
    .filter((a) => a.status === 'closed' || a.status === 'corrected')
    .sort((a, b) => b.date.localeCompare(a.date) || b.checkInAt.localeCompare(a.checkInAt));

  // Scope the instance lookup to the worker's own attendance date range instead of
  // an all-time scan ('0000-01-01'..'9999-12-31') — cheap for a single worker's history.
  const instanceMap = new Map<string, string>();
  const dates = closedAttendance.map((a) => a.date).filter(Boolean);
  if (dates.length > 0) {
    const from = dates.reduce((min, d) => (d < min ? d : min));
    const to = dates.reduce((max, d) => (d > max ? d : max));
    const instances = await listInstances(gw, { from, to });
    for (const i of instances) instanceMap.set(i.id, i.location);
  }

  const attended: AttendedRow[] = closedAttendance.map((a) => ({
    id: a.id,
    date: a.date,
    location: instanceMap.get(a.instanceId) || '—',
    checkInAt: a.checkInAt,
    checkOutAt: a.checkOutAt,
    hours: a.hours,
  }));

  return {
    questions,
    questionsValid,
    hasPlaces: worker.places.length > 0,
    places: worker.places,
    entries,
    totalHours,
    attended,
    today: todayISO(COMPANY_TZ),
  };
}

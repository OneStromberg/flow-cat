import type { Question, Worker } from '@scourage/worklog-core';

export type Widget =
  | { key: string; label: string; required: boolean; kind: 'select'; options: string[] }
  | { key: string; label: string; required: boolean; kind: 'date' | 'time' | 'text' | 'number' };

// Narrowed to just the one field this function reads (not the full `Worker`) so
// client components can build widgets from serialized API data — e.g. the Hours
// screen's `HoursData.places` — without needing a full `Worker` object.
export function questionToWidget(q: Question, worker: Pick<Worker, 'places'>): Widget {
  const base = { key: q.key, label: q.text, required: q.required };
  switch (q.type) {
    case 'worker_places':
      return { ...base, kind: 'select', options: worker.places };
    case 'choice':
      return { ...base, kind: 'select', options: q.options };
    case 'date':
      return { ...base, kind: 'date' };
    case 'time':
      return { ...base, kind: 'time' };
    case 'number':
      return { ...base, kind: 'number' };
    default:
      return { ...base, kind: 'text' };
  }
}

import type { Question, Worker } from '@scourage/worklog-core';
import type { OutboundMessage } from '../whatsapp/types.ts';

function optionList(text: string, options: string[]): OutboundMessage {
  return {
    kind: 'list',
    body: text,
    rows: options.map((title, i) => ({ id: `opt_${i}`, title })),
  };
}

export function renderQuestion(q: Question, worker: Worker): OutboundMessage {
  const suffix = q.required ? '' : " (optional — type 'skip' to skip)";

  switch (q.type) {
    case 'worker_places':
      return optionList(q.text, worker.places);
    case 'choice':
      return optionList(q.text, q.options);
    case 'date':
      return {
        kind: 'buttons',
        body: q.text,
        buttons: [
          { id: 'date_today', title: 'Today' },
          { id: 'date_yesterday', title: 'Yesterday' },
          { id: 'date_other', title: 'Other date' },
        ],
      };
    case 'time':
      return { kind: 'text', body: `${q.text} (e.g. 08:00)${suffix}` };
    case 'number':
    case 'text':
    default:
      return { kind: 'text', body: `${q.text}${suffix}` };
  }
}

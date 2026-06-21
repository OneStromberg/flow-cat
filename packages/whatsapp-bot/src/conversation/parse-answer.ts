import type { Question, Worker } from '@scourage/worklog-core';
import { parseClockTime, resolveTypedDate, todayISO, yesterdayISO } from '@scourage/worklog-core';
import type { InboundMessage } from '../whatsapp/types.ts';

type Result = { ok: true; value: string } | { ok: false; reprompt: string };

function matchOption(options: string[], inbound: InboundMessage): string | null {
  if (inbound.selectionId?.startsWith('opt_')) {
    const idx = Number(inbound.selectionId.slice(4));
    if (Number.isInteger(idx) && options[idx] !== undefined) return options[idx];
  }
  const t = (inbound.text ?? '').trim();
  if (t === '') return null;
  // 1-based number
  if (/^\d+$/.test(t)) {
    const i = Number(t) - 1;
    if (options[i] !== undefined) return options[i];
  }
  // case-insensitive label
  const hit = options.find((o) => o.toLowerCase() === t.toLowerCase());
  return hit ?? null;
}

function listReprompt(text: string, options: string[]): string {
  return `Please choose one:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n(${text})`;
}

export function parseAnswer(
  q: Question,
  inbound: InboundMessage,
  tz: string,
  worker: Worker,
  now: Date = new Date(),
): Result {
  switch (q.type) {
    case 'worker_places':
    case 'choice': {
      const options = q.type === 'worker_places' ? worker.places : q.options;
      const hit = matchOption(options, inbound);
      return hit ? { ok: true, value: hit } : { ok: false, reprompt: listReprompt(q.text, options) };
    }
    case 'date': {
      const raw = (inbound.selectionId ?? inbound.text ?? '').trim().toLowerCase();
      if (raw === 'date_today' || raw === 'today') return { ok: true, value: todayISO(tz, now) };
      if (raw === 'date_yesterday' || raw === 'yesterday') return { ok: true, value: yesterdayISO(tz, now) };
      if (raw === 'date_other' || raw === 'other') {
        return { ok: false, reprompt: 'Please type the date as DD/MM/YYYY (e.g. 19/06/2026).' };
      }
      const r = resolveTypedDate(inbound.text ?? '', tz, now);
      if (r.ok) return { ok: true, value: r.iso };
      return {
        ok: false,
        reprompt:
          r.reason === 'future'
            ? 'That date is in the future. Please type a past date (DD/MM/YYYY).'
            : "Sorry, I didn't understand that date. Please type it as DD/MM/YYYY.",
      };
    }
    case 'time': {
      const t = parseClockTime(inbound.text ?? '');
      if (!t) return { ok: false, reprompt: `Please enter the time as HH:MM (e.g. 08:00). — ${q.text}` };
      return { ok: true, value: `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}` };
    }
    case 'number': {
      const t = (inbound.text ?? '').trim();
      const n = Number(t);
      if (t === '' || !Number.isFinite(n)) return { ok: false, reprompt: `Please enter a number. — ${q.text}` };
      return { ok: true, value: String(n) };
    }
    case 'text':
    default: {
      const t = (inbound.text ?? '').trim();
      if (t === '') return { ok: false, reprompt: q.text };
      return { ok: true, value: t };
    }
  }
}

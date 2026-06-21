import type { SheetsGateway } from '@scourage/sheets-helper';
import type { InboundMessage, WhatsAppClient } from '../whatsapp/types.ts';
import { findWorker, appendWorkLog, normalizePhone, validateQuestions, parseClockTime, computeHours, type Worker, type Question } from '@scourage/worklog-core';
import { renderQuestion } from './render-question.ts';
import { parseAnswer } from './parse-answer.ts';
import { type Session, type SessionStore } from './session-store.ts';

export interface EngineDeps {
  gateway: SheetsGateway;
  whatsapp: WhatsAppClient;
  sessions: SessionStore;
  getQuestions: () => Promise<Question[]>;
  tz: string;
  now: () => Date;
}

const NOT_REGISTERED =
  "You're not registered yet. Please ask your manager to add your number. 🙏";
const NOT_SET_UP = 'The bot is not set up yet. Please ask your manager.';
const NO_PLACES = 'No work sites are assigned to you yet. Please ask your manager.';
const SAVE_FAILED = "Sorry, I couldn't save that. Please send your last answer again.";

function greeting(w: Worker): string {
  return w.greeting || `Hi ${w.name}!`;
}

async function text(deps: EngineDeps, to: string, body: string): Promise<void> {
  await deps.whatsapp.send(to, { kind: 'text', body });
}

export async function handleMessage(deps: EngineDeps, inbound: InboundMessage): Promise<void> {
  const phone = normalizePhone(inbound.phone);
  const lowered = (inbound.text ?? '').trim().toLowerCase();

  if (lowered === 'cancel') {
    deps.sessions.clear(phone);
    await text(deps, phone, 'Cancelled. Send any message to start again.');
    return;
  }

  let session = deps.sessions.get(phone);

  // New conversation
  if (!session) {
    const worker = await findWorker(deps.gateway, phone);
    if (!worker || !worker.active) {
      await text(deps, phone, NOT_REGISTERED);
      return;
    }

    let questions: Question[];
    try {
      questions = await deps.getQuestions();
    } catch (err) {
      console.error('Failed to load Questions config:', err);
      await text(deps, phone, NOT_SET_UP);
      return;
    }
    const v = validateQuestions(questions);
    if (!v.ok) {
      console.error('Invalid Questions config:', v.errors);
      await text(deps, phone, NOT_SET_UP);
      return;
    }

    await text(deps, phone, greeting(worker));
    session = { worker, questions, index: 0, answers: {}, updatedAt: deps.now().getTime() };
    deps.sessions.set(phone, session);
    await askCurrent(deps, phone, session);
    return;
  }

  // Pending save retry (finalize previously failed)
  if (session.index >= session.questions.length) {
    await finalize(deps, phone, session);
    return;
  }

  const q = session.questions[session.index];

  // Optional question skip
  if (!q.required && lowered === 'skip') {
    session.answers[q.key] = '';
    await advance(deps, phone, session);
    return;
  }

  const parsed = parseAnswer(q, inbound, deps.tz, session.worker, deps.now());
  if (!parsed.ok) {
    await text(deps, phone, parsed.reprompt);
    return;
  }

  // Cross-field: finish must be after start
  if (q.key === 'end' && q.type === 'time' && session.answers['start']) {
    const start = parseClockTime(session.answers['start']);
    const end = parseClockTime(parsed.value);
    if (start && end && computeHours(start, end) === null) {
      await text(deps, phone, 'Finish time must be after the start time. Please re-enter the finish time (e.g. 16:30).');
      return;
    }
  }

  session.answers[q.key] = parsed.value;
  await advance(deps, phone, session);
}

async function askCurrent(deps: EngineDeps, phone: string, session: Session): Promise<void> {
  const q = session.questions[session.index];
  if (q.type === 'worker_places' && session.worker.places.length === 0) {
    await text(deps, phone, NO_PLACES);
    deps.sessions.clear(phone);
    return;
  }
  await deps.whatsapp.send(phone, renderQuestion(q, session.worker));
}

async function advance(deps: EngineDeps, phone: string, session: Session): Promise<void> {
  session.index += 1;
  session.updatedAt = deps.now().getTime();
  if (session.index < session.questions.length) {
    deps.sessions.set(phone, session);
    await askCurrent(deps, phone, session);
  } else {
    deps.sessions.set(phone, session);
    await finalize(deps, phone, session);
  }
}

async function finalize(deps: EngineDeps, phone: string, session: Session): Promise<void> {
  const record: Record<string, string> = {
    logged_at: deps.now().toISOString(),
    phone: session.worker.phone,
    name: session.worker.name,
  };
  for (const q of session.questions) record[q.key] = session.answers[q.key] ?? '';

  const startQ = session.questions.find((q) => q.key === 'start' && q.type === 'time');
  const endQ = session.questions.find((q) => q.key === 'end' && q.type === 'time');
  if (startQ && endQ && session.answers['start'] && session.answers['end']) {
    const start = parseClockTime(session.answers['start']);
    const end = parseClockTime(session.answers['end']);
    if (start && end) {
      const h = computeHours(start, end);
      if (h !== null) record['hours'] = String(h);
    }
  }

  const keys = session.questions.map((q) => q.key);
  try {
    await appendWorkLog(deps.gateway, record, keys);
  } catch (err) {
    console.error('Failed to append WorkLog:', err);
    // keep session (index stays at length) so the next message retries
    session.updatedAt = deps.now().getTime();
    deps.sessions.set(phone, session);
    await text(deps, phone, SAVE_FAILED);
    return;
  }

  deps.sessions.clear(phone);
  await text(deps, phone, summary(session, record));
}

function summary(session: Session, record: Record<string, string>): string {
  const parts = session.questions
    .map((q) => `${q.text} ${record[q.key] || '-'}`)
    .join(' · ');
  const hours = record['hours'] ? ` · Hours ${record['hours']}` : '';
  return `Logged ✅ — ${parts}${hours}`;
}

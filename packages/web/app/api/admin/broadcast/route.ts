import type { WorkerFilters } from '../../../../lib/filter-workers';
import { filterWorkers } from '../../../../lib/filter-workers';
import { getGateway } from '../../../../lib/sheets';
import { requireManagerOrAdmin } from '../../../../lib/session';
import { sendToChatIds } from '../../../../lib/telegram';
import { listWorkers } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireManagerOrAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const message = typeof b.message === 'string' ? b.message : '';

  if (!message.trim()) {
    return Response.json({ error: 'message required' }, { status: 400 });
  }

  try {
    const workers = await listWorkers(getGateway());

    // Coerce filters object to WorkerFilters shape with defaults
    const filters: WorkerFilters = {
      search: typeof b.search === 'string' ? b.search : '',
      cities: Array.isArray(b.cities) ? b.cities.map(String) : [],
      transportation: Array.isArray(b.transportation) ? b.transportation.map(String) : [],
      hebrewLevel: Array.isArray(b.hebrewLevel) ? b.hebrewLevel.map(String) : [],
      payType: Array.isArray(b.payType) ? b.payType.map(String) : [],
      schedule: Array.isArray(b.schedule) ? b.schedule.map(String) : [],
      places: Array.isArray(b.places) ? b.places.map(String) : [],
      active: typeof b.active === 'string' && ['all', 'yes', 'no'].includes(b.active)
        ? (b.active as 'all' | 'yes' | 'no')
        : 'all',
      ageMin: typeof b.ageMin === 'string' ? b.ageMin : '',
      ageMax: typeof b.ageMax === 'string' ? b.ageMax : '',
      gender: Array.isArray(b.gender) ? b.gender.map(String) : [],
    };

    const filtered = filterWorkers(workers, filters);

    const recipients = filtered
      .filter((w) => (w.telegramChatId ?? '').trim() !== '')
      .map((w) => (w.telegramChatId ?? '').trim());

    const sent = await sendToChatIds(recipients, message);

    return Response.json({ ok: true, matched: filtered.length, sent });
  } catch (err) {
    console.error('broadcast failed:', err);
    return Response.json({ error: 'broadcast failed' }, { status: 503 });
  }
}

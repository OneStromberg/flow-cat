import type { WorkerFilters } from '../../../../../lib/filter-workers';
import { filterWorkers } from '../../../../../lib/filter-workers';
import { getGateway } from '../../../../../lib/sheets';
import { requireAdmin } from '../../../../../lib/session';
import { sendOfferToChatIds } from '../../../../../lib/telegram';
import { listWorkers, listTemplates, listPlaces, formatTemplateOffer } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const templateId = typeof b.templateId === 'string' ? b.templateId.trim() : '';

  if (!templateId) {
    return Response.json({ error: 'templateId required' }, { status: 400 });
  }

  try {
    const gw = getGateway();
    const [templates, places, workers] = await Promise.all([
      listTemplates(gw),
      listPlaces(gw),
      listWorkers(gw),
    ]);

    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return Response.json({ error: 'template not found' }, { status: 404 });

    const place = places.find((p) => p.name === tpl.location);

    // Mirror the same filter coercion as the existing broadcast route
    const filters: WorkerFilters = {
      search: typeof b.search === 'string' ? b.search : '',
      cities: Array.isArray(b.cities) ? b.cities.map(String) : [],
      transportation: Array.isArray(b.transportation) ? b.transportation.map(String) : [],
      hebrewLevel: Array.isArray(b.hebrewLevel) ? b.hebrewLevel.map(String) : [],
      payType: Array.isArray(b.payType) ? b.payType.map(String) : [],
      schedule: Array.isArray(b.schedule) ? b.schedule.map(String) : [],
      places: Array.isArray(b.places) ? b.places.map(String) : [],
      active:
        typeof b.active === 'string' && ['all', 'yes', 'no'].includes(b.active)
          ? (b.active as 'all' | 'yes' | 'no')
          : 'all',
      ageMin: typeof b.ageMin === 'string' ? b.ageMin : '',
      ageMax: typeof b.ageMax === 'string' ? b.ageMax : '',
      gender: Array.isArray(b.gender) ? b.gender.map(String) : [],
    };

    const filtered = filterWorkers(workers, filters);

    const recipientChatIds = filtered
      .filter((w) => (w.telegramChatId ?? '').trim() !== '')
      .map((w) => (w.telegramChatId ?? '').trim());

    const text = formatTemplateOffer(tpl, { contact: place?.contact });
    const markup = {
      inline_keyboard: [
        [{ text: '✅ Принять предложение', callback_data: `accept:${tpl.id}` }],
        [{ text: '📞 Связаться', callback_data: `contact:${tpl.id}` }],
      ],
    };

    const sent = await sendOfferToChatIds(recipientChatIds, text, markup);

    return Response.json({ ok: true, matched: filtered.length, sent });
  } catch (err) {
    console.error('template broadcast failed:', err);
    return Response.json({ error: 'broadcast failed' }, { status: 503 });
  }
}

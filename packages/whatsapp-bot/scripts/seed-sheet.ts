// One-shot operator helper: ensure the four tabs exist and seed
// Workers / Places / Questions with starter content. Idempotent — it only
// seeds a tab that is currently empty, and never touches WorkLogs data rows.
//
// Run from the repo root:
//   node --env-file=packages/whatsapp-bot/.env --import tsx packages/whatsapp-bot/scripts/seed-sheet.ts
import { createGoogleGateway, ensureTabs } from '@scourage/sheets-helper';
import { loadConfig } from '../src/config.ts';

const SEED: Record<string, string[][]> = {
  Workers: [
    ['phone', 'name', 'greeting', 'places', 'active'],
    ['15551230000', 'Test Worker', 'Welcome back, Test Worker!', 'Main Warehouse, Office HQ', 'yes'],
  ],
  Places: [
    ['place_name', 'active'],
    ['Main Warehouse', 'yes'],
    ['Office HQ', 'yes'],
  ],
  Questions: [
    ['order', 'key', 'type', 'text', 'options', 'required'],
    ['1', 'place', 'worker_places', 'Where did you work?', '', 'yes'],
    ['2', 'date', 'date', 'Which day did you work?', '', 'yes'],
    ['3', 'start', 'time', 'What time did you start?', '', 'yes'],
    ['4', 'end', 'time', 'What time did you finish?', '', 'yes'],
  ],
  WorkLogs: [['logged_at', 'phone', 'name', 'place', 'date', 'start', 'end', 'hours']],
};

const config = loadConfig(process.env);
const opts = { keyFilePath: config.keyFilePath, spreadsheetId: config.spreadsheetId };

const created = await ensureTabs(opts, Object.keys(SEED));
if (created.length) console.log(`Created tabs: ${created.join(', ')}`);

const gw = createGoogleGateway(opts);
for (const [tab, rows] of Object.entries(SEED)) {
  const cur = await gw.readTab(tab);
  const hasData = cur.some((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (hasData) {
    console.log(`Skipped ${tab} (already has content)`);
    continue;
  }
  await gw.writeHeaderRow(tab, rows[0]);
  for (const row of rows.slice(1)) await gw.appendRow(tab, row);
  console.log(`Seeded ${tab} (${rows.length} row(s))`);
}

console.log('\nDone. Sheet is ready for the bot.');

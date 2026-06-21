// Non-interactive end-to-end smoke: drive a full conversation through the
// real engine + real Google Sheet (console transport), then read back the
// WorkLogs row that was written.
//
// Run from the repo root:
//   node --env-file=packages/whatsapp-bot/.env --import tsx packages/whatsapp-bot/scripts/smoke.ts
import { createGoogleGateway } from '@scourage/sheets-helper';
import { loadConfig } from '../src/config.ts';
import { createApp } from '../src/app.ts';
import { handleMessage } from '../src/conversation/engine.ts';

const config = loadConfig(process.env);
const phone = config.localWorkerPhone;
const { deps } = createApp(config);

async function send(text: string): Promise<void> {
  console.log(`\nyou> ${text}`);
  await handleMessage(deps, { phone, text });
}

console.log(`=== Smoke test as worker ${phone} ===`);
await send('hi'); // greet + ask place
await send('1'); // pick first place (Main Warehouse)
await send('today');
await send('08:00');
await send('16:30');

const gw = createGoogleGateway({ keyFilePath: config.keyFilePath, spreadsheetId: config.spreadsheetId });
const rows = await gw.readTab('WorkLogs');
console.log('\n--- WorkLogs (header + last row) ---');
console.log(rows[0].join(' | '));
console.log(rows[rows.length - 1].join(' | '));

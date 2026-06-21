// Operator helper: append a worker row (with a generated magic-link token).
//   node --env-file=packages/whatsapp-bot/.env --import tsx \
//     packages/whatsapp-bot/scripts/add-worker.ts <phone> <name> [places]
import { createGoogleGateway } from '@scourage/sheets-helper';
import { generateToken } from '@scourage/worklog-core';
import { loadConfig } from '../src/config.ts';

const [, , phone, name = 'Worker', places = 'Main Warehouse, Office HQ'] = process.argv;
if (!phone) {
  console.error('Usage: add-worker.ts <phone> <name> [places]');
  process.exit(1);
}

const config = loadConfig(process.env);
const gw = createGoogleGateway({ keyFilePath: config.keyFilePath, spreadsheetId: config.spreadsheetId });
const token = generateToken();
await gw.appendRow('Workers', [phone, name, `Welcome back, ${name}!`, places, 'yes', token]);
console.log(`Added worker ${phone} (${name}); link token: ${token}`);

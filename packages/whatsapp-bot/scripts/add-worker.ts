// Operator helper: append a worker row to the Workers tab.
//   node --env-file=packages/whatsapp-bot/.env --import tsx \
//     packages/whatsapp-bot/scripts/add-worker.ts <phone> <name> [places]
import { createGoogleGateway } from '@scourage/sheets-helper';
import { loadConfig } from '../src/config.ts';

const [, , phone, name = 'Worker', places = 'Main Warehouse, Office HQ'] = process.argv;
if (!phone) {
  console.error('Usage: add-worker.ts <phone> <name> [places]');
  process.exit(1);
}

const config = loadConfig(process.env);
const gw = createGoogleGateway({ keyFilePath: config.keyFilePath, spreadsheetId: config.spreadsheetId });
await gw.appendRow('Workers', [phone, name, `Welcome back, ${name}!`, places, 'yes']);
console.log(`Added worker ${phone} (${name}) with places: ${places}`);

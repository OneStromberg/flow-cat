import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig } from '../config.ts';
import { createApp } from '../app.ts';
import { handleMessage } from '../conversation/engine.ts';

const config = loadConfig(process.env);
if (config.transport !== 'console') {
  console.error('repl.ts requires WHATSAPP_TRANSPORT=console');
  process.exit(1);
}
if (!config.localWorkerPhone) {
  console.error('Set LOCAL_WORKER_PHONE in .env');
  process.exit(1);
}

const { deps } = createApp(config);
const rl = createInterface({ input: stdin, output: stdout });

console.log(`Simulating worker ${config.localWorkerPhone}. Type messages (Ctrl+C to quit).`);
console.log('Tip: send any message to start; use numbers or button text to answer.\n');

for (;;) {
  const line = await rl.question('you> ');
  await handleMessage(deps, { phone: config.localWorkerPhone, text: line });
}

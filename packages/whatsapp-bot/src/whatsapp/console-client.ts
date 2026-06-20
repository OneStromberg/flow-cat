import type { OutboundMessage, WhatsAppClient } from './types.ts';

export function createConsoleClient(
  write: (line: string) => void = (l) => console.log(l),
): WhatsAppClient {
  return {
    async send(_to, msg) {
      if (msg.kind === 'text') {
        write(`bot> ${msg.body}`);
      } else if (msg.kind === 'buttons') {
        write(`bot> ${msg.body}`);
        write(msg.buttons.map((b, i) => `  [${i + 1}] ${b.title}`).join('   '));
      } else {
        write(`bot> ${msg.body}`);
        write(msg.rows.map((r, i) => `  ${i + 1}. ${r.title}`).join('\n'));
      }
    },
  };
}

import type { InboundMessage } from './types.ts';

export function parseWebhook(body: unknown): InboundMessage | null {
  const b = body as any;
  const msg = b?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || !msg.from) return null;

  if (msg.type === 'text' && msg.text?.body) {
    return { phone: String(msg.from), text: String(msg.text.body) };
  }

  if (msg.type === 'interactive') {
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    if (reply?.id) {
      return {
        phone: String(msg.from),
        text: reply.title ? String(reply.title) : undefined,
        selectionId: String(reply.id),
      };
    }
  }

  return null;
}

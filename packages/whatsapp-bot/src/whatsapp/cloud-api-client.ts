import type { OutboundMessage, WhatsAppClient } from './types.ts';

export function toGraphPayload(to: string, msg: OutboundMessage): unknown {
  if (msg.kind === 'text') {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: msg.body },
    };
  }
  if (msg.kind === 'buttons') {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: msg.body },
        action: {
          buttons: msg.buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    };
  }
  // list
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: msg.body },
      action: {
        button: 'Choose',
        sections: [
          { rows: msg.rows.map((r) => ({ id: r.id, title: r.title.slice(0, 24) })) },
        ],
      },
    },
  };
}

export function createCloudApiClient(opts: {
  token: string;
  phoneNumberId: string;
  fetchImpl?: typeof fetch;
}): WhatsAppClient {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://graph.facebook.com/v21.0/${opts.phoneNumberId}/messages`;
  return {
    async send(to, msg) {
      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toGraphPayload(to, msg)),
      });
      if (!res.ok) {
        console.error('WhatsApp send failed:', res.status, await res.text().catch(() => ''));
      }
    },
  };
}

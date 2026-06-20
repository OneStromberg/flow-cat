import { createServer } from 'node:http';
import { loadConfig } from './config.ts';
import { createApp } from './app.ts';
import { handleMessage } from './conversation/engine.ts';
import { parseWebhook } from './whatsapp/parse-webhook.ts';
import { verifySignature } from './whatsapp/verify-signature.ts';
import { createCloudApiClient } from './whatsapp/cloud-api-client.ts';

const config = loadConfig(process.env);
const whatsapp = createCloudApiClient({
  token: config.whatsappToken,
  phoneNumberId: config.whatsappPhoneNumberId,
});
const { deps } = createApp(config, whatsapp);

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost`);

    if (req.method === 'GET' && url.pathname === '/webhook') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === config.metaVerifyToken) {
        res.writeHead(200).end(challenge ?? '');
      } else {
        res.writeHead(403).end('forbidden');
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/webhook') {
      const raw = await readBody(req);
      const sig = req.headers['x-hub-signature-256'] as string | undefined;
      if (!verifySignature(raw, sig, config.metaAppSecret)) {
        res.writeHead(401).end('bad signature');
        return;
      }
      // Respond immediately; process asynchronously.
      res.writeHead(200).end('ok');
      try {
        const inbound = parseWebhook(JSON.parse(raw));
        if (inbound) await handleMessage(deps, inbound);
      } catch (err) {
        console.error('webhook handling error:', err);
      }
      return;
    }

    res.writeHead(404).end('not found');
  } catch (err) {
    console.error('unhandled server error:', err);
    if (!res.headersSent) res.writeHead(500).end();
  }
});

server.listen(config.port, () => {
  console.log(`Webhook server listening on :${config.port}`);
});

export interface Config {
  transport: 'console' | 'cloud';
  spreadsheetId: string;
  keyFilePath: string;
  timezone: string;
  localWorkerPhone: string;
  whatsappToken: string;
  whatsappPhoneNumberId: string;
  metaAppSecret: string;
  metaVerifyToken: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const errors: string[] = [];
  const req = (name: string): string => {
    const v = (env[name] ?? '').trim();
    if (!v) errors.push(name);
    return v;
  };

  const transport = (env.WHATSAPP_TRANSPORT ?? 'console').trim() === 'cloud' ? 'cloud' : 'console';
  const spreadsheetId = req('SHEETS_SPREADSHEET_ID');
  const keyFilePath = req('GOOGLE_APPLICATION_CREDENTIALS');
  const timezone = req('COMPANY_TIMEZONE');
  const localWorkerPhone = (env.LOCAL_WORKER_PHONE ?? '').trim();

  let whatsappToken = (env.WHATSAPP_TOKEN ?? '').trim();
  let whatsappPhoneNumberId = (env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim();
  let metaAppSecret = (env.META_APP_SECRET ?? '').trim();
  let metaVerifyToken = (env.META_VERIFY_TOKEN ?? '').trim();

  if (transport === 'cloud') {
    whatsappToken = req('WHATSAPP_TOKEN');
    whatsappPhoneNumberId = req('WHATSAPP_PHONE_NUMBER_ID');
    metaAppSecret = req('META_APP_SECRET');
    metaVerifyToken = req('META_VERIFY_TOKEN');
  }

  if (errors.length) {
    throw new Error(`Missing required env vars: ${errors.join(', ')}`);
  }

  return {
    transport,
    spreadsheetId,
    keyFilePath,
    timezone,
    localWorkerPhone,
    whatsappToken,
    whatsappPhoneNumberId,
    metaAppSecret,
    metaVerifyToken,
    port: Number(env.PORT ?? '3000') || 3000,
  };
}

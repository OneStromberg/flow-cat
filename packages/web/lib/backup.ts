import { parseServiceAccountJson } from '@scourage/sheets-helper';

const google = require('googleapis') as any;

export async function backupSpreadsheet(
  timestamp: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; reason: string }> {
  const folderId = process.env.BACKUP_DRIVE_FOLDER_ID;
  if (!folderId) {
    return { ok: false, reason: 'BACKUP_DRIVE_FOLDER_ID not set' };
  }

  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    return { ok: false, reason: 'SHEETS_SPREADSHEET_ID not set' };
  }

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return { ok: false, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON not set' };
  }

  try {
    const credentials = parseServiceAccountJson(serviceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.copy({
      fileId: spreadsheetId,
      requestBody: {
        name: `FlowCat backup ${timestamp}`,
        parents: [folderId],
      },
      supportsAllDrives: true,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      name: `FlowCat backup ${timestamp}`,
    };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

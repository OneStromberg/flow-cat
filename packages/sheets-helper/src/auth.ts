import { google } from 'googleapis';
import type { ServiceAccountCredentials } from './credentials.ts';

export interface SheetsAuthOptions {
  spreadsheetId: string;
  keyFilePath?: string;
  credentials?: ServiceAccountCredentials;
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export function buildSheetsAuth(opts: SheetsAuthOptions) {
  if (opts.credentials) return new google.auth.GoogleAuth({ credentials: opts.credentials, scopes: SCOPES });
  if (opts.keyFilePath) return new google.auth.GoogleAuth({ keyFile: opts.keyFilePath, scopes: SCOPES });
  throw new Error('sheets-helper: provide keyFilePath or credentials');
}

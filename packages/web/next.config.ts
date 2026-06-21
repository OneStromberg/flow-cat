import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

const config: NextConfig = {
  transpilePackages: ['@scourage/sheets-helper', '@scourage/worklog-core'],
  // Monorepo: trace + bundle the sibling workspace packages into the
  // serverless functions (otherwise Vercel can't find them at runtime).
  outputFileTracingRoot: repoRoot,
};

export default config;

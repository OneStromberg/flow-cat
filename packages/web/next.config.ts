import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@scourage/sheets-helper', '@scourage/worklog-core'],
};

export default config;

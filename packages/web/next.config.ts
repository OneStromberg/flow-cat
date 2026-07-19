import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Disabled in dev so `next dev` is never poisoned by SW caching — the SW is a
  // production-build artifact only. We register it ourselves via <ServiceWorkerRegister/>.
  disable: process.env.NODE_ENV === 'development',
  register: false,
});

const config: NextConfig = {
  transpilePackages: ['@scourage/sheets-helper', '@scourage/worklog-core'],
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default withSerwist(config);

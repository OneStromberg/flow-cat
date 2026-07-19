// Shared SWR fetcher for the worker screens (Hours / Profile / Checkin).
//
// The naive `(url) => fetch(url).then(r => r.json())` pattern treats ANY
// response — including a 401 from `/api/worker/*` (expired/deactivated
// session, see `requireWorker`) — as successful data. SWR then hands the
// error body (`{ error: 'unauthorized' }`) to the screen as if it were the
// real payload, so consumers either crash on a missing field or silently
// render a misleading empty state.
//
// `assertOk` is split out as a pure function (status in, throw or return)
// so the bug's actual surface — "what happens for a given HTTP status" — is
// unit-testable without mocking `fetch` or a session.

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export function assertOk(status: number): void {
  if (status === 401) {
    throw new UnauthorizedError();
  }
  if (status < 200 || status >= 300) {
    throw new Error('request failed: ' + status);
  }
}

export async function swrFetcher(url: string) {
  const res = await fetch(url);
  assertOk(res.status);
  return res.json();
}

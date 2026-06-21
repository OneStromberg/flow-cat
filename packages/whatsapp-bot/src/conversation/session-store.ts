import type { Worker, Question } from '@scourage/worklog-core';

export interface Session {
  worker: Worker;
  questions: Question[];
  index: number;
  answers: Record<string, string>;
  updatedAt: number;
}

export interface SessionStore {
  get(phone: string): Session | undefined;
  set(phone: string, s: Session): void;
  clear(phone: string): void;
}

export function createMemorySessionStore(
  ttlMs: number,
  now: () => Date = () => new Date(),
): SessionStore {
  const map = new Map<string, Session>();
  return {
    get(phone) {
      const s = map.get(phone);
      if (!s) return undefined;
      if (now().getTime() - s.updatedAt > ttlMs) {
        map.delete(phone);
        return undefined;
      }
      return s;
    },
    set(phone, s) {
      map.set(phone, s);
    },
    clear(phone) {
      map.delete(phone);
    },
  };
}

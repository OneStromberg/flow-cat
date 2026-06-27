# UX Part A — App Shell (Nav + Mobile Filters) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Mobile-first bottom-tab navigation for admin + worker areas, and multi-select dropdown filters on the workers list.

**Architecture:** Next.js App Router layouts (`app/admin/layout.tsx`, `app/app/layout.tsx`) render fixed bottom nav bars (client components using `usePathname`). A reusable `MultiSelectDropdown` replaces the worker filter chips. No data-model changes.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind.

## Global Constraints
- web extensionless imports; client components marked `'use client'`. Verify `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`.
- Mobile-first: bottom bars fixed, full-width, tap targets ≥40px; content wrappers get bottom padding (`pb-20`) so content clears the bar.
- Nav icons = emoji (no icon dependency). Active tab via `usePathname` (prefix match, but `/admin` and `/app` match exactly so the index tab isn't always active — see Task 1).
- Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: Admin bottom nav + layout
**Files:** Create `packages/web/app/admin/admin-nav.tsx`, `packages/web/app/admin/layout.tsx`; modify `packages/web/app/admin/page.tsx` (remove the ad-hoc header nav links, keep `+ Add worker`).

- [ ] **Step 1: `admin-nav.tsx`** (`'use client'`):
```tsx
'use client';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Workers', icon: '👥', exact: true },
  { href: '/admin/shifts', label: 'Shifts', icon: '🗓' },
  { href: '/admin/places', label: 'Places', icon: '📍' },
  { href: '/admin/attendance', label: 'Attendance', icon: '✅' },
  { href: '/admin/payroll', label: 'Payroll', icon: '💰' },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-gray-200 bg-white">
      {TABS.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <a key={t.href} href={t.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-gray-900' : 'text-gray-400'}`}>
            <span className="text-lg leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: `admin/layout.tsx`** (server component wrapping all `/admin/*`):
```tsx
import { AdminNav } from './admin-nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-20">
      {children}
      <AdminNav />
    </div>
  );
}
```

- [ ] **Step 3: trim `admin/page.tsx` header** — remove the `<a href="/admin/places|shifts|attendance|payroll">` links block (now in the nav bar); keep the `+ Add worker` link. (Read the file; replace the link group with just the Add-worker link.)

- [ ] **Step 4: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): admin bottom-tab nav layout"`

---

### Task 2: Worker bottom nav + layout + Profile page
**Files:** Create `packages/web/app/app/worker-nav.tsx`, `packages/web/app/app/layout.tsx`, `packages/web/app/app/profile/page.tsx`; modify `packages/web/app/app/page.tsx` (move TelegramConnect + LogoutButton to Profile; keep entry form + hours).

- [ ] **Step 1: `worker-nav.tsx`** (`'use client'`) — same pattern as AdminNav, tabs: `{ '/app/checkin','Check-in','⏱' }`, `{ '/app','Hours','📋', exact:true }`, `{ '/app/profile','Profile','👤' }`.

- [ ] **Step 2: `app/layout.tsx`** — server layout wrapping `/app/*`: `<div className="pb-20">{children}<WorkerNav /></div>`.

- [ ] **Step 3: `app/profile/page.tsx`** — server component, `requireWorker()`→`redirect('/login')`. Renders the worker's name, `<TelegramConnect phone={worker.phone} linked={!!worker.telegramChatId} />`, and `<LogoutButton />`. `runtime='nodejs'`, `dynamic='force-dynamic'`. (Import `TelegramConnect` from `../../components/telegram-connect`, `LogoutButton` from `../logout-button`.)

- [ ] **Step 4: trim `app/page.tsx`** — remove `<LogoutButton />` and `<TelegramConnect .../>` (now on Profile); keep the greeting, entry form, and worked-hours list. Retitle if helpful ("Hours").

- [ ] **Step 5: Verify.** typecheck + build.
- [ ] **Step 6: Commit.** `git commit -m "feat(web): worker bottom-tab nav + profile page"`

---

### Task 3: MultiSelectDropdown + worker filter dropdowns
**Files:** Create `packages/web/app/components/multi-select-dropdown.tsx`; modify `packages/web/app/admin/workers-filter.tsx`.

- [ ] **Step 1: `multi-select-dropdown.tsx`** (`'use client'`):
```tsx
'use client';
import { useState, useRef, useEffect } from 'react';

type Opt = { value: string; label: string };
export function MultiSelectDropdown({ label, options, selected, onChange }: {
  label: string; options: Opt[]; selected: string[]; onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm">
        {label}{selected.length ? ` (${selected.length})` : ''}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
          {options.length === 0 && <p className="px-2 py-2 text-sm text-gray-400">No options</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: wire into `workers-filter.tsx`** — Read it first. Replace each `<Chips .../>` group (city, gender, transportation, hebrew level, pay type, schedule, places) with `<MultiSelectDropdown label=... options=... selected={f.<field>} onChange={(v)=>setF((p)=>({...p,<field>:v}))} />`. `city`/`places` options come from the existing `cities`/`places` props mapped to `{value,label}`; enum fields from the `enums` prop. Keep the `active` `<select>`, age inputs, and Clear button. Lay them out in a responsive grid (`grid grid-cols-2 gap-2`) for mobile. Remove the now-unused `Chips` helper.

- [ ] **Step 3: Verify.** typecheck + build.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): multi-select dropdown filters on workers list"`

---

## Self-Review Notes
- **Spec coverage:** admin nav (T1), worker nav + profile (T2), multi-select filter dropdowns (T3). Bottom-bar + pb-20 padding throughout (mobile-first).
- **No data-model changes;** `filterWorkers`/`WorkerFilters` untouched (T3 only swaps the input controls).
- Active-tab logic: index tabs (`/admin`, `/app`) use `exact`; others prefix-match.

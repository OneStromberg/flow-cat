'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, DEFAULT_LANG, type Lang } from '../../lib/i18n/strings';
import { LangSwitcher } from './lang-switcher';

const TABS = [
  { href: '/app/checkin', key: 'nav.checkin', icon: '⏱' },
  { href: '/app/hours', key: 'nav.hours', icon: '📋', exact: true },
  { href: '/app/profile', key: 'nav.profile', icon: '👤' },
] as const;

// Non-worker roles (manager/admin) also get a way back to the admin panel —
// mirrors the "My shifts" link AdminNav already offers in the other direction.
const ADMIN_TAB = { href: '/admin', key: 'nav.admin', icon: '🛠' } as const;

export function WorkerNav({ lang = DEFAULT_LANG, role }: { lang?: Lang; role?: string }) {
  const path = usePathname();
  const tabs = role && role !== 'worker' ? [...TABS, ADMIN_TAB] : TABS;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white">
      <div className="flex justify-center border-b border-gray-100 py-1.5">
        <LangSwitcher lang={lang} />
      </div>
      <div className="flex">
        {tabs.map((tab) => {
          const active = 'exact' in tab && tab.exact ? path === tab.href : path.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-gray-900' : 'text-gray-400'}`}>
              <span className="text-lg leading-none">{tab.icon}</span>
              <span>{t(tab.key, lang)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

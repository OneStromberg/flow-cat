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

export function WorkerNav({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white">
      <div className="flex justify-center border-b border-gray-100 py-1.5">
        <LangSwitcher lang={lang} />
      </div>
      <div className="flex">
        {TABS.map((tab) => {
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

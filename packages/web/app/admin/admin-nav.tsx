'use client';
import Link from 'next/link';
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
          <Link key={t.href} href={t.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-gray-900' : 'text-gray-400'}`}>
            <span className="text-lg leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

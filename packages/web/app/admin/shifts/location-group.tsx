'use client';
import { useState } from 'react';

export function LocationGroup({ title, summary, defaultOpen = true, children }: {
  title: string; summary: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md bg-gray-50 px-2 py-1 text-left text-xs font-medium text-gray-700 hover:bg-gray-100">
        <span>{open ? '▾' : '▸'} {title}</span>
        <span className="text-gray-400">{summary}</span>
      </button>
      {open && <div className="mt-1 space-y-1">{children}</div>}
    </div>
  );
}

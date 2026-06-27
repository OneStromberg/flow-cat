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

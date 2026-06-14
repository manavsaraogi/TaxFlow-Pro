'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface SelectCode {
  code: string;
  description: string;
  group: string;
}

interface CodeSelectProps {
  value: string;
  onChange: (code: string, description: string) => void;
  codes: SelectCode[];
  placeholder?: string;
  className?: string;
}

/**
 * Searchable grouped dropdown for ITR code fields (business codes, TDS sections, etc.)
 * Renders: [code badge]  Description text  ▼
 */
export function CodeSelect({ value, onChange, codes, placeholder = 'Select…', className = '' }: CodeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = codes.find(c => c.code === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const filtered = query.trim()
    ? codes.filter(c =>
        c.code.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase()) ||
        c.group.toLowerCase().includes(query.toLowerCase())
      )
    : codes;

  const groups: Record<string, SelectCode[]> = {};
  for (const c of filtered) (groups[c.group] ??= []).push(c);

  function select(c: SelectCode) {
    onChange(c.code, c.description);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }} className={className}>
      {/* Trigger */}
      <div
        role="combobox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)',
          borderRadius: '6px', cursor: 'pointer', background: 'var(--bg-input, var(--bg-surface))',
          fontSize: '0.82rem', minHeight: '34px',
          boxShadow: open ? '0 0 0 2px var(--brand-primary)40' : undefined,
        }}
      >
        {selected ? (
          <>
            <span style={{
              background: 'var(--brand-primary)', color: '#fff',
              borderRadius: '4px', padding: '1px 5px',
              fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
            }}>{selected.code}</span>
            <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.description}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)', flex: 1 }}>{placeholder}</span>
        )}
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', zIndex: 999, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
          borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          maxHeight: '320px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by code or name…"
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', border: '1px solid var(--border-color)', borderRadius: '5px',
                padding: '5px 8px', fontSize: '0.8rem',
                background: 'var(--bg-input, var(--bg-page))', color: 'var(--text-primary)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {Object.keys(groups).length === 0 && (
              <div style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                No results for "{query}"
              </div>
            )}
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div style={{
                  padding: '4px 10px 2px', fontSize: '0.65rem', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--text-muted)', borderTop: '1px solid var(--border-light, var(--border-color))',
                }}>
                  {group}
                </div>
                {items.map(c => (
                  <div
                    key={c.code}
                    onClick={() => select(c)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      padding: '6px 10px', cursor: 'pointer', fontSize: '0.8rem',
                      backgroundColor: c.code === value ? 'var(--brand-primary)15' : 'transparent',
                      color: c.code === value ? 'var(--brand-primary)' : 'var(--text-primary)',
                    }}
                    onMouseEnter={e => { if (c.code !== value) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover, rgba(0,0,0,0.04))'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = c.code === value ? 'var(--brand-primary)15' : 'transparent'; }}
                  >
                    <span style={{
                      background: c.code === value ? 'var(--brand-primary)' : 'var(--border-color)',
                      color: c.code === value ? '#fff' : 'var(--text-secondary)',
                      borderRadius: '4px', padding: '1px 5px',
                      fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap', minWidth: '36px', textAlign: 'center',
                    }}>{c.code}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.description}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

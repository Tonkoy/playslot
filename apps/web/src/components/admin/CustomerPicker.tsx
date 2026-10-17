'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { type ClubCustomer, listClubCustomers } from '@/lib/api';

/**
 * Pick the player a staff booking is for: type a name, phone or e-mail and
 * choose from the matches. Picking a registered player links the booking to
 * their account — they see it under "My bookings" and get the e-mails — while
 * free text still works for a walk-in who has no account.
 */
export function CustomerPicker({
  clubId,
  value,
  onChange,
}: {
  clubId: number;
  /** Either a chosen account, or the typed name of a walk-in. */
  value: { userId: number | null; name: string };
  onChange: (next: { userId: number | null; name: string }) => void;
}) {
  const t = useTranslations('Calendar');
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = `customer-options-${clubId}`;

  // Debounce: the field is typed into, not submitted.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 220);
    return () => clearTimeout(id);
  }, [term]);

  const results = useQuery({
    queryKey: ['club-customers', clubId, debounced],
    queryFn: () => listClubCustomers(clubId, debounced),
    enabled: open,
    staleTime: 30_000,
  });

  // Close when the click lands outside the whole control.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const list: ClubCustomer[] = results.data ?? [];

  const choose = (c: ClubCustomer) => {
    onChange({ userId: c.id, name: c.name });
    setTerm(c.name);
    setOpen(false);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', minWidth: 230 }}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={term || value.name}
        placeholder={t('customerSearch')}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setTerm(e.target.value);
          setActive(0);
          setOpen(true);
          // Typing after a pick means the pick no longer stands: keep the text
          // as a walk-in name until another account is chosen.
          onChange({ userId: null, name: e.target.value });
        }}
        onKeyDown={(e) => {
          if (!open || list.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % list.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i - 1 + list.length) % list.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(list[active]!);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        style={{
          minHeight: 40,
          width: '100%',
          padding: '0 10px',
          border: `1px solid ${value.userId ? 'var(--green)' : 'var(--line-2)'}`,
          background: 'var(--surface)',
          color: 'var(--ink)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'inherit',
          fontSize: 14,
          boxSizing: 'border-box',
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            maxHeight: 220,
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow)',
          }}
        >
          {results.isLoading && <li style={hintRow}>…</li>}
          {!results.isLoading && list.length === 0 && (
            <li style={hintRow}>{debounced.trim().length >= 2 ? t('noCustomers') : t('customerHint')}</li>
          )}
          {list.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 8px',
                  border: 'none',
                  borderRadius: 8,
                  background: i === active ? 'var(--green-soft)' : 'transparent',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                <span className="mono" style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>
                  {[c.email, c.phone].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const hintRow: React.CSSProperties = { padding: '8px', fontSize: 13, color: 'var(--ink-3)' };

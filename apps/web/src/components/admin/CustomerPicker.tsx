'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Combobox, type PickerOption } from '@/components/Picker';
import { listClubCustomers } from '@/lib/api';

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
  value: { userId: number | null; name: string };
  onChange: (next: { userId: number | null; name: string }) => void;
}) {
  const t = useTranslations('Calendar');

  // Debounce: the field is typed into, not submitted.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.userId ? '' : value.name), 220);
    return () => clearTimeout(id);
  }, [value.name, value.userId]);

  const results = useQuery({
    queryKey: ['club-customers', clubId, debounced],
    queryFn: () => listClubCustomers(clubId, debounced),
    staleTime: 30_000,
  });

  const options: PickerOption[] = (results.data ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
    hint: [c.email, c.phone].filter(Boolean).join(' · ') || null,
  }));

  return (
    <Combobox
      id={`customer-${clubId}`}
      options={options}
      value={value.userId ? String(value.userId) : null}
      text={value.name}
      placeholder={t('customerSearch')}
      loading={results.isLoading}
      emptyHint={debounced.trim().length >= 2 ? t('noCustomers') : t('customerHint')}
      allowFreeText
      // Typing after a pick means the pick no longer stands: the text becomes a
      // walk-in name until another account is chosen.
      onText={(name) => onChange({ userId: null, name })}
      onPick={(o) => onChange({ userId: Number(o.value), name: o.label })}
    />
  );
}

'use client';

/* eslint-disable @next/next/no-img-element -- coach photos are arbitrary remote
   URLs (each club's own host); see Avatar.tsx. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Avatar } from './Avatar';
import { Modal } from './Modal';

/**
 * Avatar that opens the full-size photo on click. Used where coaches are
 * listed, so a thumbnail is enough to recognise someone but the big picture is
 * one click away.
 *
 * The trigger is a span, not a button: these avatars often sit inside a card
 * that is itself a link, and interactive elements can't be nested in an <a>.
 * It still behaves like a button — focusable, Enter/Space, aria-label — and it
 * stops the click from following the card's link.
 */
export function AvatarZoom({
  name,
  photoUrl,
  size = 44,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const c = useTranslations('Common');
  const [open, setOpen] = useState(false);

  if (!photoUrl) return <Avatar name={name} size={size} />;

  const show = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={c('viewPhoto', { name })}
        title={c('viewPhoto', { name })}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') show(e);
        }}
        style={{ display: 'inline-flex', flexShrink: 0, borderRadius: '50%', cursor: 'zoom-in' }}
      >
        <Avatar name={name} photoUrl={photoUrl} size={size} />
      </span>

      <Modal open={open} onClose={() => setOpen(false)} title={name} maxWidth={560}>
        <img
          src={photoUrl}
          alt={name}
          style={{
            display: 'block',
            width: '100%',
            maxHeight: '70vh',
            objectFit: 'contain',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-2)',
          }}
        />
      </Modal>
    </>
  );
}

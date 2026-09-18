'use client';

import { useTranslations } from 'next-intl';
import { Modal } from './Modal';
import { SearchClient } from './SearchClient';
import { useSearchModal } from './SearchModalContext';

/** Renders the shared search modal once; opened from the nav icon or a hero CTA. */
export function SearchModalHost() {
  const h = useTranslations('Home');
  const { open, closeModal } = useSearchModal();
  return (
    <Modal open={open} onClose={closeModal} title={h('searchCourt')} centerTitle maxWidth={760} maxHeightVh={92}>
      <SearchClient />
    </Modal>
  );
}

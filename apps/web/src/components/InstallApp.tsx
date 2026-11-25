'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useInstallState } from '@/lib/pwa';
import { Modal } from './Modal';

/** How to install by hand, where the browser offers no install dialog. */
function Steps({ ios }: { ios: boolean }) {
  const t = useTranslations('Pwa');
  const steps = ios ? [t('iosStep1'), t('iosStep2'), t('iosStep3')] : [t('manualStep1'), t('manualStep2')];
  return (
    <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 8, color: 'var(--ink-2)', listStyle: 'decimal' }}>
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}

/** The by-hand steps in a dialog. Rendered by whoever owns the button, so it
 *  outlives a menu that closes when its item is pressed. */
export function InstallHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Pwa');
  const { state } = useInstallState();
  return (
    <Modal open={open} onClose={onClose} title={t('howTitle')}>
      <Steps ios={state === 'ios'} />
    </Modal>
  );
}

/**
 * "Инсталирай приложението" as a menu item. Where the browser has an install
 * dialog (Android, desktop Chrome/Edge) it opens it; on an iPhone, where
 * installing is only possible by hand, it asks its owner to show the steps.
 * Renders nothing once installed, or where it could not help.
 */
export function InstallMenuItem({
  style,
  onDone,
  onNeedHelp,
}: {
  style?: React.CSSProperties;
  /** Called after either path, so the menu can close. */
  onDone?: () => void;
  onNeedHelp: () => void;
}) {
  const t = useTranslations('Pwa');
  const { state, install } = useInstallState();
  if (state !== 'promptable' && state !== 'ios') return null;
  return (
    <button
      type="button"
      onClick={async () => {
        if (state === 'promptable') await install();
        else onNeedHelp();
        onDone?.();
      }}
      style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', ...style }}
    >
      {t('install')}
    </button>
  );
}

/** The same offer as a row on the account page, with its own steps dialog. */
export function InstallAppRow() {
  const t = useTranslations('Pwa');
  const { state, install } = useInstallState();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 200 }}>
        <strong style={{ fontWeight: 600, fontSize: 14 }}>{t('cardTitle')}</strong>
        <span className="acct-help" style={{ display: 'block', marginTop: 2 }}>
          {state === 'installed' ? t('installed') : t('cardHelp')}
        </span>
      </span>
      {state !== 'installed' && (
        <button
          type="button"
          className="acct-btn is-primary"
          onClick={() => (state === 'promptable' ? void install() : setHelpOpen(true))}
        >
          {state === 'promptable' ? t('install') : t('how')}
        </button>
      )}
      <InstallHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

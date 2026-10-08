'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getPushConfig, subscribePush, unsubscribePush } from '@/lib/api';
import { useToast } from './Toast';

/**
 * VAPID keys travel base64url; the browser wants raw bytes. Backed by an
 * explicit ArrayBuffer so the result satisfies BufferSource — `Uint8Array.from`
 * widens to ArrayBufferLike, which `applicationServerKey` rejects.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type Support = 'checking' | 'supported' | 'unsupported';

/**
 * Browser push permission for this device. Push is per-browser, not per
 * account, so the state here describes the browser you're reading it in.
 */
export function PushNotificationToggle() {
  const t = useTranslations('PushNotifications');
  const tt = useTranslations('Toasts');
  const qc = useQueryClient();
  const toast = useToast();

  const [support, setSupport] = useState<Support>('checking');
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribedHere, setSubscribedHere] = useState(false);

  const config = useQuery({ queryKey: ['pushConfig'], queryFn: getPushConfig });

  useEffect(() => {
    // iOS Safari only exposes PushManager once the site is installed to the
    // home screen, so this check doubles as the "add to home screen" gate.
    const ok =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupport(ok ? 'supported' : 'unsupported');
    if (!ok) return;

    setPermission(Notification.permission);
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const existing = await reg?.pushManager.getSubscription();
      setSubscribedHere(Boolean(existing));
    });
  }, []);

  const enable = useMutation({
    mutationFn: async () => {
      const publicKey = config.data?.publicKey;
      if (!publicKey) throw new Error(t('notConfigured'));

      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') throw new Error(t('denied'));

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Re-use an existing subscription; calling subscribe twice with a
      // different key throws InvalidStateError.
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error(t('failed'));
      }
      await subscribePush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent.slice(0, 400),
      });
    },
    onSuccess: () => {
      setSubscribedHere(true);
      qc.invalidateQueries({ queryKey: ['pushConfig'] });
      toast(t('enabled'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return;
      await unsubscribePush(sub.endpoint);
      await sub.unsubscribe();
    },
    onSuccess: () => {
      setSubscribedHere(false);
      qc.invalidateQueries({ queryKey: ['pushConfig'] });
      toast(t('disabled'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const busy = enable.isPending || disable.isPending;

  // What the row says under its heading, and whether a button makes sense.
  const status = (() => {
    if (support === 'checking' || config.isLoading) {
      return { text: '…', action: null as 'enable' | 'disable' | null };
    }
    if (support === 'unsupported') return { text: t('unsupported'), action: null };
    // No key, or the endpoint isn't reachable: either way there's nothing to
    // subscribe to, so offer no button rather than a guaranteed failure.
    if (config.isError || config.data?.publicKey == null) {
      return { text: t('notConfigured'), action: null };
    }
    if (permission === 'denied') return { text: t('blocked'), action: null };
    if (subscribedHere) return { text: t('onThisDevice'), action: 'disable' as const };
    return { text: t('help'), action: 'enable' as const };
  })();

  return (
    <div style={row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontWeight: 600, fontSize: 14 }}>{t('title')}</strong>
        <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 12, marginTop: 2 }}>
          {status.text}
        </span>
        {config.data && config.data.subscriptions > 1 && (
          <span className="mono" style={{ display: 'block', color: 'var(--ink-3)', fontSize: 11, marginTop: 4 }}>
            {t('otherDevices', { count: config.data.subscriptions })}
          </span>
        )}
      </div>

      {status.action === 'enable' && (
        <button type="button" onClick={() => enable.mutate()} disabled={busy} style={primaryBtn}>
          {busy ? '…' : t('enable')}
        </button>
      )}
      {status.action === 'disable' && (
        <button type="button" onClick={() => disable.mutate()} disabled={busy} style={secondaryBtn}>
          {busy ? '…' : t('disable')}
        </button>
      )}
    </div>
  );
}

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  padding: '12px 14px',
  background: 'var(--surface-2)',
};
const primaryBtn: React.CSSProperties = {
  minHeight: 40,
  padding: '0 16px',
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  borderRadius: 'var(--pill)',
  fontWeight: 700,
  cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  minHeight: 40,
  padding: '0 16px',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--pill)',
  fontWeight: 600,
  cursor: 'pointer',
};

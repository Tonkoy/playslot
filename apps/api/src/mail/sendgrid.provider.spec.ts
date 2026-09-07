import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerEnv } from '@playslot/config';
import { SendGridMailProvider } from './sendgrid.provider';

const env = {
  SENDGRID_API_KEY: 'SG.test-key',
  MAIL_FROM: 'PlaySlot <no-reply@playslot.app>',
} as unknown as ServerEnv;

function mockFetch(response: Partial<Response>) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    text: async () => '',
    ...response,
  } as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('SendGridMailProvider', () => {
  it('shapes the v3 mail/send payload with plain text before html', async () => {
    const fetchMock = mockFetch({});
    await new SendGridMailProvider(env).send({
      to: 'player@example.com',
      subject: 'Booking confirmed',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer SG.test-key');

    const body = JSON.parse(init.body);
    expect(body.personalizations).toEqual([{ to: [{ email: 'player@example.com' }] }]);
    expect(body.from).toEqual({ name: 'PlaySlot', email: 'no-reply@playslot.app' });
    expect(body.subject).toBe('Booking confirmed');
    expect(body.content).toEqual([
      { type: 'text/plain', value: 'Hi' },
      { type: 'text/html', value: '<p>Hi</p>' },
    ]);
  });

  it('omits the plain-text part when no text is given', async () => {
    const fetchMock = mockFetch({});
    await new SendGridMailProvider(env).send({
      to: 'a@b.com',
      subject: 'S',
      html: '<p>x</p>',
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.content).toEqual([{ type: 'text/html', value: '<p>x</p>' }]);
  });

  it('parses a bare from-address without a display name', async () => {
    const fetchMock = mockFetch({});
    await new SendGridMailProvider({
      ...env,
      MAIL_FROM: 'no-reply@playslot.app',
    } as ServerEnv).send({ to: 'a@b.com', subject: 'S', html: '<p>x</p>' });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.from).toEqual({ email: 'no-reply@playslot.app' });
  });

  it('throws email_send_failed:<status> on a non-2xx response', async () => {
    mockFetch({ ok: false, status: 401, text: async () => 'unauthorized' });
    await expect(
      new SendGridMailProvider(env).send({ to: 'a@b.com', subject: 'S', html: '<p>x</p>' }),
    ).rejects.toThrow('email_send_failed:401');
  });
});

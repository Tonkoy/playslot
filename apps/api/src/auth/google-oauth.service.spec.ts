import type { ServerEnv } from '@playslot/config';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import { GoogleOAuthService } from './google-oauth.service';

function service(overrides: Partial<ServerEnv>): GoogleOAuthService {
  const env = {
    API_BASE_URL: 'http://localhost:3001',
    APP_BASE_URL: 'http://localhost:3000',
    ...overrides,
  } as ServerEnv;
  return new GoogleOAuthService(env);
}

describe('GoogleOAuthService', () => {
  it('reports not configured without client credentials', () => {
    expect(service({}).isConfigured()).toBe(false);
  });

  it('reports configured with client id + secret', () => {
    expect(
      service({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }).isConfigured(),
    ).toBe(true);
  });

  it('builds a valid authorization URL with the api callback redirect', () => {
    const svc = service({ GOOGLE_CLIENT_ID: 'my-client', GOOGLE_CLIENT_SECRET: 'secret' });
    const url = new URL(svc.getAuthorizationUrl('state-123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('my-client');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3001/api/auth/google/callback',
    );
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('throws when building a URL while unconfigured', () => {
    expect(() => service({}).getAuthorizationUrl('x')).toThrow(AppException);
  });
});

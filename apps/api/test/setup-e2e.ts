// Ensures required env exists for the e2e app to boot. DATABASE_URL must be
// supplied by the runner and point at a disposable TEST database.
process.env.NODE_ENV ||= 'test';
process.env.AUTH_SECRET ||= 'test-secret-at-least-16-characters-long';
process.env.APP_BASE_URL ||= 'http://localhost:3000';
process.env.API_BASE_URL ||= 'http://localhost:3001';
// Fake Google creds so the OAuth URL builder works; token exchange is never
// reached in tests (they only assert the redirect + CSRF-state handling).
process.env.GOOGLE_CLIENT_ID ||= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ||= 'test-google-client-secret';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'e2e tests require DATABASE_URL to point at a test Postgres. ' +
      'Start Docker (docker compose up -d), apply migrations ' +
      '(pnpm --filter @playslot/db migrate:deploy), then re-run.',
  );
}

import { Global, Module } from '@nestjs/common';
import { loadServerEnv, type ServerEnv } from '@playslot/config';

export const SERVER_ENV = 'SERVER_ENV';

/**
 * Validates process.env once (fail-fast, spec §21) and exposes the typed env via
 * the SERVER_ENV token for injection across modules.
 */
@Global()
@Module({
  providers: [
    {
      provide: SERVER_ENV,
      useFactory: (): ServerEnv => loadServerEnv(),
    },
  ],
  exports: [SERVER_ENV],
})
export class AppConfigModule {}

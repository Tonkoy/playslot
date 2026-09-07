import { Global, Module } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { SERVER_ENV } from '../config/app-config.module';
import { createMailProvider, MAIL_PROVIDER, type MailProvider } from './mail-provider';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [
    MailService,
    {
      provide: MAIL_PROVIDER,
      inject: [SERVER_ENV],
      // Resend / SendGrid / console, picked from env (see createMailProvider).
      useFactory: (env: ServerEnv): MailProvider => createMailProvider(env),
    },
  ],
  exports: [MailService],
})
export class MailModule {}

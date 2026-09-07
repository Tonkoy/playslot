import { Logger } from '@nestjs/common';
import type { MailProvider, SendEmailInput } from './mail-provider';

/**
 * Dev/test fallback: logs the email to the console instead of sending it, so
 * local dev works without an email provider configured.
 */
export class ConsoleMailProvider implements MailProvider {
  readonly name = 'console';
  private readonly logger = new Logger('Mail');

  async send(input: SendEmailInput): Promise<void> {
    this.logger.log(
      `[dev-mail] To: ${input.to} | Subject: ${input.subject}\n${input.text ?? input.html}`,
    );
  }
}

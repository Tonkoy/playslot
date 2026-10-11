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
    // With a designed template, the data is what would be rendered — log that
    // instead of the fallback HTML, so local dev shows what SendGrid would get.
    const payload = input.template
      ? `template=${input.template.key} ${JSON.stringify(input.template.data, null, 2)}`
      : (input.text ?? input.html);
    this.logger.log(`[dev-mail] To: ${input.to} | Subject: ${input.subject}\n${payload}`);
  }
}

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { type ApiError, type ErrorCode, httpStatusFor } from '@playslot/contracts';
import { AppException } from './app-exception';
import { type ApiLocale, normalizeLocale, t } from './i18n';

/**
 * Single place that shapes every error into the contract `{ error, message,
 * details? }` (spec §14) with the right status and a localized message. Internal
 * details never leak; 500s are logged (Sentry-ready).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { user?: { locale?: string } }>();
    const locale = this.resolveLocale(req);

    const { code, details, messageOverride, logAsError } = this.classify(exception);
    const status = httpStatusFor(code);
    const message = messageOverride ?? t(code, locale);

    if (logAsError) {
      this.logger.error(
        `${req.method} ${req.url} → ${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiError = details ? { error: code, message, details } : { error: code, message };
    res.status(status).json(body);
  }

  private resolveLocale(req: Request & { user?: { locale?: string } }): ApiLocale {
    const header = req.header?.('x-locale') ?? req.header?.('accept-language');
    return normalizeLocale(req.user?.locale ?? header);
  }

  private classify(exception: unknown): {
    code: ErrorCode;
    details?: Record<string, unknown>;
    messageOverride?: string;
    logAsError: boolean;
  } {
    if (exception instanceof AppException) {
      return {
        code: exception.code,
        details: exception.details,
        messageOverride:
          exception.message && exception.message !== exception.code ? exception.message : undefined,
        logAsError: exception.code === 'internal',
      };
    }

    if (exception instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of exception.issues) {
        const key = issue.path.join('.') || '_';
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return { code: 'validation_failed', details: { fields: fieldErrors }, logAsError: false };
    }

    if (exception instanceof HttpException) {
      return { code: this.mapHttpStatus(exception.getStatus()), logAsError: false };
    }

    return { code: 'internal', logAsError: true };
  }

  private mapHttpStatus(status: number): ErrorCode {
    switch (status) {
      case 400:
        return 'validation_failed';
      case 401:
        return 'unauthenticated';
      case 403:
        return 'forbidden';
      case 404:
        return 'not_found';
      case 409:
        return 'availability_changed';
      case 422:
        return 'policy_violation';
      case 429:
        return 'rate_limited';
      default:
        return 'internal';
    }
  }
}

import { type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validates and parses a payload with a Zod schema (golden rule §2.9). Zod
 * errors are thrown as-is and shaped into `validation_failed` by the global
 * filter. Use as `@Body(new ZodBody(schema))`.
 */
export class ZodBody<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    return this.schema.parse(value);
  }
}

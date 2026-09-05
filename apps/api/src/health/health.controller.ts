import { Controller, Get } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  service: 'playslot-api';
  timestamp: string;
}

/**
 * Liveness/readiness probe (spec §20: expose `/health`). Deliberately does no
 * I/O so it stays fast and dependency-free; deeper readiness checks (DB, Redis)
 * are layered in once those modules exist.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'playslot-api',
      timestamp: new Date().toISOString(),
    };
  }
}

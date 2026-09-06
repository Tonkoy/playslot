import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok';
  service: 'playslot-api';
  timestamp: string;
}

/**
 * Liveness (`/health`) + readiness (`/health/ready`) probes (spec §20). Liveness
 * does no I/O; readiness verifies the database connection so orchestrators only
 * route traffic when the app can actually serve.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  check(): HealthStatus {
    return { status: 'ok', service: 'playslot-api', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ready'; db: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppException('internal', { db: 'down' });
    }
    return { status: 'ready', db: 'up' };
  }
}

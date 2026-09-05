import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

/**
 * Root module of the PlaySlot modular monolith (spec §4). Domain modules
 * (auth, clubs, resources, availability, pricing, reservations, payments,
 * cancellations, coaching, notifications, admin, platform) are added in later
 * milestones. Only the health probe exists in Phase 0.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}

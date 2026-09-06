import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppConfigModule } from './config/app-config.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { ClubsModule } from './clubs/clubs.module';
import { CoachingModule } from './coaching/coaching.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ResourcesModule } from './resources/resources.module';

/**
 * Root of the PlaySlot modular monolith (spec §4). Phase 1 wires config, Prisma,
 * mail, auth (with global auth + role guards), clubs, and resources. Remaining
 * domain modules (availability, pricing, reservations, payments, coaching,
 * notifications) arrive in later phases.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    MailModule,
    EventsModule,
    AuthModule,
    ClubsModule,
    ResourcesModule,
    AvailabilityModule,
    ReservationsModule,
    CoachingModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}

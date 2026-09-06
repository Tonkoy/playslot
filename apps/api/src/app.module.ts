import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { SecurityModule } from './common/turnstile.service';
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
 * Root of the PlaySlot modular monolith (spec §4): config, Prisma, mail, live
 * events, auth (+ global auth/role guards), clubs, resources, availability,
 * reservations, coaching, health. Hardening (§20): a global rate limiter
 * (Throttler), Turnstile, security headers (helmet, in main.ts).
 */
@Module({
  imports: [
    // Default: 120 req/min/IP; relaxed under test so the e2e suite isn't throttled.
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 100_000 : 120 },
    ]),
    AppConfigModule,
    SecurityModule,
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
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

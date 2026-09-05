import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { ServerEnv } from '@playslot/config';
import { SERVER_ENV } from '../config/app-config.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClubMembershipGuard } from './club-membership.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [SERVER_ENV],
      useFactory: (env: ServerEnv) => ({
        secret: env.AUTH_SECRET,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    ClubMembershipGuard,
    // Order matters: authenticate, then check platform roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, ClubMembershipGuard],
})
export class AuthModule {}

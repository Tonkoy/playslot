import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { loadServerEnv } from '@playslot/config';
import { AppModule } from './app.module';

// Load env from the monorepo root .env (and a local apps/api/.env if present).
// Real process.env always wins — dotenv never overrides already-set vars.
loadDotenv({ path: resolve(process.cwd(), '.env') });
loadDotenv({ path: resolve(process.cwd(), '../../.env') });

async function bootstrap(): Promise<void> {
  // Fail fast on bad configuration (golden rule §21).
  const env = loadServerEnv();

  // rawBody enables Stripe webhook signature verification (spec §17).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Credentialed CORS: reflect the origin (can't use "*" with credentials). In
  // production, restrict to the web origin; in dev, reflect any localhost origin.
  app.enableCors({
    origin: env.NODE_ENV === 'production' ? [env.APP_BASE_URL] : true,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableShutdownHooks();

  // Behind a platform proxy (Railway, Fly, a load balancer) every request
  // arrives from the proxy's IP. Without this, `req.ip` is that one address
  // and the global rate limiter throttles all users as if they were one.
  app.set('trust proxy', 1);

  // Hosting platforms inject PORT and route to it; fall back to the port in
  // API_BASE_URL for local dev, where that URL carries an explicit port.
  const port = Number(process.env.PORT) || Number(new URL(env.API_BASE_URL).port) || 3001;
  // Bind all interfaces — inside a container, localhost isn't reachable.
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`PlaySlot API listening on :${port} (/api)`);
}

void bootstrap();

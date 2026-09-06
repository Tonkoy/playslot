import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
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
  const app = await NestFactory.create(AppModule, { rawBody: true });
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

  const port = new URL(env.API_BASE_URL).port || '3001';
  await app.listen(Number(port));
  new Logger('Bootstrap').log(`PlaySlot API listening on ${env.API_BASE_URL} (/api)`);
}

void bootstrap();

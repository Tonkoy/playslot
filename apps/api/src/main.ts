import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { loadServerEnv } from '@playslot/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Fail fast on bad configuration (golden rule §21).
  const env = loadServerEnv();

  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();

  const port = new URL(env.API_BASE_URL).port || '3001';
  await app.listen(Number(port));
  new Logger('Bootstrap').log(`PlaySlot API listening on ${env.API_BASE_URL} (/api)`);
}

void bootstrap();

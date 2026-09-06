import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

const fakePrisma = { $queryRaw: async () => [{ '?column?': 1 }] } as unknown as PrismaService;

describe('HealthController (unit)', () => {
  it('reports ok status', () => {
    const result = new HealthController(fakePrisma).check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('playslot-api');
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });

  it('reports ready when the db responds', async () => {
    const result = await new HealthController(fakePrisma).ready();
    expect(result.status).toBe('ready');
    expect(result.db).toBe('up');
  });
});

describe('GET /health (integration via Supertest)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: fakePrisma }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with an ok body', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('playslot-api');
  });
});

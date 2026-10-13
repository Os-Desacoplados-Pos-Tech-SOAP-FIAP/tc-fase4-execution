import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { criarApp } from '../helpers/app';

describe('Health (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await criarApp()));
  afterAll(() => app.close());

  it('GET /api/execution/health é público', async () => {
    await request(app.getHttpServer()).get('/api/execution/health').expect(200, { status: 'ok' });
  });

  it('Swagger publicado em /api/execution/docs', async () => {
    await request(app.getHttpServer()).get('/api/execution/docs').expect(200);
  });
});

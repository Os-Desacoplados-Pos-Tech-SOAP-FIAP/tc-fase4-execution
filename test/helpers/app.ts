import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app.setup';

export async function criarApp(): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication({ logger: false });
  configurarApp(app);
  await app.init();
  return app;
}

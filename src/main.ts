// OTel precisa ser carregado antes de qualquer módulo instrumentado.
import './tracing';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configurarApp, PREFIXO } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configurarApp(app);

  const port = app.get(ConfigService).get<number>('PORT') ?? 3000;
  await app.listen(port);
  app.get(Logger).log(`Execution Service em http://localhost:${port}/${PREFIXO}`);
}

void bootstrap();

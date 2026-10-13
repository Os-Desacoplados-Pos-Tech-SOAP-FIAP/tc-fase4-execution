import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export const PREFIXO = 'api/execution';

export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix(PREFIXO);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();

  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Execution Service')
      .setDescription('Fila de diagnóstico e reparo, apontamentos e transação pivô da saga de OS')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(`${PREFIXO}/docs`, app, documento);
}

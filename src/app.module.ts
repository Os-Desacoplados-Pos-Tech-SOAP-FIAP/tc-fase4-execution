import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { trace } from '@opentelemetry/api';
import { LoggerModule } from 'nestjs-pino';

import { RolesGuard } from './common/guards/roles.guard';
import { validarAmbiente } from './config/env.validation';
import { JwtAuthGuard } from './infrastructure/auth/jwt-auth.guard';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { ExecucaoModule } from './modules/execucao/execucao.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarAmbiente }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        // Token JWT e cookies nunca vão para o log.
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        // trace_id/span_id em todo log: salto direto do log para o trace no Grafana.
        mixin() {
          const span = trace.getActiveSpan();
          if (!span) return {};
          const { traceId, spanId } = span.spanContext();
          return { trace_id: traceId, span_id: spanId };
        },
        transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    InfrastructureModule,
    HealthModule,
    ExecucaoModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

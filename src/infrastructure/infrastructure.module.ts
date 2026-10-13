import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { ConfigExecucao, INJECTION_TOKENS } from '../common/constants/injection-tokens';
import { JwtStrategy } from './auth/jwt.strategy';
import { DynamoModule } from './dynamo/dynamo.module';
import { DynamoUnitOfWork } from './dynamo/dynamo-unit-of-work';
import { MessagingModule } from './messaging/messaging.module';
import { relogioSistema } from './relogio-sistema';
import { DynamoCapacidade } from './repositories/DynamoCapacidade';
import { DynamoMetricas } from './repositories/DynamoMetricas';
import { DynamoOrdemExecucaoRepository } from './repositories/DynamoOrdemExecucaoRepository';
import { DynamoOutbox } from './repositories/DynamoOutbox';
import { DynamoProcessedMessageRepository } from './repositories/DynamoProcessedMessageRepository';

const CAPACIDADE_PADRAO = 3;

const bindings = [
  { provide: INJECTION_TOKENS.ORDEM_EXECUCAO_REPOSITORY, useClass: DynamoOrdemExecucaoRepository },
  { provide: INJECTION_TOKENS.CAPACIDADE_EXECUCAO, useClass: DynamoCapacidade },
  { provide: INJECTION_TOKENS.METRICAS_EXECUCAO, useClass: DynamoMetricas },
  { provide: INJECTION_TOKENS.PROCESSED_MESSAGE_REPOSITORY, useClass: DynamoProcessedMessageRepository },
  { provide: INJECTION_TOKENS.OUTBOX, useClass: DynamoOutbox },
  { provide: INJECTION_TOKENS.TRANSACTION_MANAGER, useExisting: DynamoUnitOfWork },
  { provide: INJECTION_TOKENS.RELOGIO, useValue: relogioSistema },
  {
    provide: INJECTION_TOKENS.CONFIG_EXECUCAO,
    useFactory: (): ConfigExecucao => ({
      capacidadeMaxima: Number(process.env.EXECUTION_MAX_CONCURRENT ?? CAPACIDADE_PADRAO),
    }),
  },
];

@Global()
@Module({
  imports: [DynamoModule, MessagingModule, PassportModule],
  providers: [...bindings, JwtStrategy],
  exports: bindings.map((binding) => binding.provide),
})
export class InfrastructureModule {}

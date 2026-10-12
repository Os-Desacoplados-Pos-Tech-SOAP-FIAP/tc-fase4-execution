import { Inject, Injectable } from '@nestjs/common';
import { context, propagation } from '@opentelemetry/api';

import { MessageEnvelope } from '../../application/ports/message-envelope';
import { IOutbox } from '../../application/ports/outbox';
import { chaves } from '../dynamo/chaves';
import { DYNAMO_CONFIG, DynamoConfig } from '../dynamo/dynamo.config';
import { DynamoUnitOfWork } from '../dynamo/dynamo-unit-of-work';
import { MESSAGING_CONFIG, MessagingConfig } from '../messaging/messaging.config';

/**
 * A chave ordena a outbox por OS: versão da ordem gravada/lida na transação + índice
 * dentro dela. Transações de uma mesma OS são serializadas pela versão otimista.
 */
@Injectable()
export class DynamoOutbox implements IOutbox {
  constructor(
    private readonly uow: DynamoUnitOfWork,
    @Inject(DYNAMO_CONFIG) private readonly dynamo: DynamoConfig,
    @Inject(MESSAGING_CONFIG) private readonly mensageria: MessagingConfig,
  ) {}

  async publicar(envelope: MessageEnvelope, destino?: string): Promise<void> {
    const grupo = envelope.correlationId;
    this.uow.adicionar({
      Put: {
        TableName: this.dynamo.tabela,
        Item: {
          ...chaves.outbox(grupo, this.uow.versaoDe(grupo), this.uow.proximoIndice(grupo), envelope.messageId),
          groupId: grupo,
          type: envelope.type,
          destination: destino ?? this.mensageria.eventsTopicArn,
          body: envelope,
          traceparent: traceparentAtivo(),
          tentativas: 0,
          criadoEm: new Date().toISOString(),
        },
      },
    });
  }
}

/** O envio acontece depois, fora do contexto atual: o contexto W3C é gravado com o evento. */
function traceparentAtivo(): string | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent;
}

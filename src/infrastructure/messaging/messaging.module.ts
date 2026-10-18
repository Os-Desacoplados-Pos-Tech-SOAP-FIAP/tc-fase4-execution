import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import { Global, Module } from '@nestjs/common';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { GaugesMensageria, MetricasMensageria } from '../telemetry/metricas-mensageria';
import { MessageHandlerRegistry } from './message-handler.registry';
import { lerMessagingConfig, MESSAGING_CONFIG, MessagingConfig } from './messaging.config';
import { OutboxLease } from './outbox-lease';
import { OutboxPublisher } from './outbox.publisher';
import { SnsSqsTransport, SQS_PUBLICACAO } from './sns-sqs.transport';
import { SqsInboxConsumer } from './sqs-inbox.consumer';

/**
 * Clientes de publicação do OutboxPublisher: o pior envio
 * (maxAttempts × (connectionTimeout + requestTimeout)) entra no orçamento do
 * lease do publicador (DURACAO_LEASE_MS em outbox-lease.ts).
 */
const opcoesPublicacao = (config: MessagingConfig) => ({
  region: config.region,
  endpoint: config.endpoint,
  maxAttempts: 2,
  requestHandler: new NodeHttpHandler({ requestTimeout: 3000, connectionTimeout: 2000 }),
});

@Global()
@Module({
  providers: [
    { provide: MESSAGING_CONFIG, useFactory: () => lerMessagingConfig(process.env) },
    // Sem timeout, o SDK espera a rede indefinidamente. Este é o SQS do consumidor: o
    // long-poll é de 20s, então o timeout precisa ficar acima disso para não cortar o Receive.
    {
      provide: SQSClient,
      inject: [MESSAGING_CONFIG],
      useFactory: (config: MessagingConfig) =>
        new SQSClient({
          region: config.region,
          endpoint: config.endpoint,
          requestHandler: new NodeHttpHandler({ requestTimeout: 25_000, connectionTimeout: 2000 }),
        }),
    },
    {
      provide: SQS_PUBLICACAO,
      inject: [MESSAGING_CONFIG],
      useFactory: (config: MessagingConfig) => new SQSClient(opcoesPublicacao(config)),
    },
    {
      provide: SNSClient,
      inject: [MESSAGING_CONFIG],
      useFactory: (config: MessagingConfig) => new SNSClient(opcoesPublicacao(config)),
    },
    SnsSqsTransport,
    MessageHandlerRegistry,
    SqsInboxConsumer,
    MetricasMensageria,
    GaugesMensageria,
    OutboxLease,
    OutboxPublisher,
  ],
  exports: [MESSAGING_CONFIG, MessageHandlerRegistry],
})
export class MessagingModule {}

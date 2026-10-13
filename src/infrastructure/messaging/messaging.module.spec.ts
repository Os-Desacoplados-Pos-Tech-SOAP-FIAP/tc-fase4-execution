import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NodeHttpHandlerOptions } from '@smithy/node-http-handler';

import { DYNAMO_CONFIG } from '../dynamo/dynamo.config';
import { MessagingModule } from './messaging.module';
import { SnsSqsTransport, SQS_PUBLICACAO } from './sns-sqs.transport';
import { SqsInboxConsumer } from './sqs-inbox.consumer';

@Global()
@Module({
  providers: [
    { provide: DynamoDBDocumentClient, useValue: {} },
    { provide: DYNAMO_CONFIG, useValue: { tabela: 'tabela-teste' } },
  ],
  exports: [DynamoDBDocumentClient, DYNAMO_CONFIG],
})
class DynamoFalsoModule {}

// O NodeHttpHandler só resolve as opções na primeira requisição; lê-las da promessa evita
// fazer uma chamada de rede no teste.
const timeouts = (cliente: SQSClient | SNSClient) =>
  (cliente.config.requestHandler as unknown as { configProvider: Promise<NodeHttpHandlerOptions> })
    .configProvider;

describe('MessagingModule', () => {
  let modulo: TestingModule;

  beforeAll(async () => {
    modulo = await Test.createTestingModule({
      imports: [DynamoFalsoModule, MessagingModule],
    }).compile();
  });
  afterAll(() => modulo.close());

  it('publicação usa SQS próprio com envio limitado; o consumidor mantém o long-poll', async () => {
    const consumo = modulo.get(SQSClient);
    const publicacao = modulo.get<SQSClient>(SQS_PUBLICACAO);

    expect(publicacao).not.toBe(consumo);
    expect(await publicacao.config.maxAttempts()).toBe(2);
    expect(await timeouts(publicacao)).toMatchObject({ requestTimeout: 3000, connectionTimeout: 2000 });
    expect(await timeouts(consumo)).toMatchObject({ requestTimeout: 25_000 });

    expect((modulo.get(SnsSqsTransport) as unknown as { sqs: SQSClient }).sqs).toBe(publicacao);
    expect((modulo.get(SqsInboxConsumer) as unknown as { sqs: SQSClient }).sqs).toBe(consumo);
  });

  it('SNS com no máximo 2 tentativas e timeouts curtos', async () => {
    const sns = modulo.get(SNSClient);

    expect(await sns.config.maxAttempts()).toBe(2);
    expect(await timeouts(sns)).toMatchObject({ requestTimeout: 3000, connectionTimeout: 2000 });
  });
});

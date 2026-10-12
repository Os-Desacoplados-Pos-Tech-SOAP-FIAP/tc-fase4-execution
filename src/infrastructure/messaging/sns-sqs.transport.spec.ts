import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';

import { criarEnvelope } from '../../application/ports/message-envelope';
import { SnsSqsTransport } from './sns-sqs.transport';

describe('SnsSqsTransport', () => {
  const sns = mockClient(SNSClient);
  const sqs = mockClient(SQSClient);
  const transporte = new SnsSqsTransport(new SNSClient({}), new SQSClient({}));
  const envelope = criarEnvelope('catalog.x.v1', 'os-1', { a: 1 });

  beforeEach(() => {
    sns.reset();
    sqs.reset();
  });

  it('publica no tópico FIFO com grupo = OS e deduplicação = messageId', async () => {
    await transporte.enviar('arn:aws:sns:us-east-1:1:oficina-catalog-events.fifo', envelope);
    const chamada = sns.commandCalls(PublishCommand)[0].args[0].input;
    expect(chamada).toMatchObject({
      TopicArn: 'arn:aws:sns:us-east-1:1:oficina-catalog-events.fifo',
      MessageGroupId: 'os-1',
      MessageDeduplicationId: envelope.messageId,
      MessageAttributes: { type: { DataType: 'String', StringValue: 'catalog.x.v1' } },
    });
    expect(JSON.parse(chamada.Message!)).toEqual(envelope);
    expect(sqs.commandCalls(SendMessageCommand)).toHaveLength(0);
  });

  it('propaga o traceparent como atributo da mensagem quando presente', async () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    await transporte.enviar('arn:aws:sns:us-east-1:1:t.fifo', envelope, traceparent);
    await transporte.enviar('https://sqs.us-east-1.amazonaws.com/1/fila.fifo', envelope, traceparent);
    const esperado = {
      type: { DataType: 'String', StringValue: 'catalog.x.v1' },
      traceparent: { DataType: 'String', StringValue: traceparent },
    };
    expect(sns.commandCalls(PublishCommand)[0].args[0].input.MessageAttributes).toEqual(esperado);
    expect(sqs.commandCalls(SendMessageCommand)[0].args[0].input.MessageAttributes).toEqual(esperado);
  });

  it('sem traceparent (null) envia só o atributo type', async () => {
    await transporte.enviar('arn:aws:sns:us-east-1:1:t.fifo', envelope, null);
    expect(sns.commandCalls(PublishCommand)[0].args[0].input.MessageAttributes).toEqual({
      type: { DataType: 'String', StringValue: 'catalog.x.v1' },
    });
  });

  it('envia direto para uma fila quando o destino é URL', async () => {
    await transporte.enviar('https://sqs.us-east-1.amazonaws.com/1/fila.fifo', envelope);
    expect(sqs.commandCalls(SendMessageCommand)[0].args[0].input).toMatchObject({
      QueueUrl: 'https://sqs.us-east-1.amazonaws.com/1/fila.fifo',
      MessageGroupId: 'os-1',
    });
  });
});

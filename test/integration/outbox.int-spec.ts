import { QueryCommand } from '@aws-sdk/lib-dynamodb';

import { criarEnvelope, MessageEnvelope } from '../../src/application/ports/message-envelope';
import { lerDynamoConfig } from '../../src/infrastructure/dynamo/dynamo.config';
import { DynamoUnitOfWork } from '../../src/infrastructure/dynamo/dynamo-unit-of-work';
import { lerMessagingConfig } from '../../src/infrastructure/messaging/messaging.config';
import { OutboxLease } from '../../src/infrastructure/messaging/outbox-lease';
import { OutboxPublisher } from '../../src/infrastructure/messaging/outbox.publisher';
import { SnsSqsTransport } from '../../src/infrastructure/messaging/sns-sqs.transport';
import { DynamoOutbox } from '../../src/infrastructure/repositories/DynamoOutbox';
import { documentoTeste, TABELA_TESTE } from '../helpers/dynamo';
import { limparTabela } from '../helpers/limpar-tabela';

describe('Outbox DynamoDB (integração)', () => {
  const doc = documentoTeste();
  const dynamo = lerDynamoConfig(process.env);
  const mensageria = lerMessagingConfig({ EVENTS_TOPIC_ARN: 'arn:aws:sns:us-east-1:1:t.fifo' });
  const uow = new DynamoUnitOfWork(doc);
  const outbox = new DynamoOutbox(uow, dynamo, mensageria);
  let enviados: MessageEnvelope[];
  let enviar: jest.Mock;
  const publicador = () =>
    new OutboxPublisher(
      doc,
      { enviar } as unknown as SnsSqsTransport,
      new OutboxLease(doc, dynamo),
      dynamo,
      mensageria,
    );

  const gravar = (osId: string, versao: number, tipo: string) =>
    uow.run(async () => {
      uow.registrarVersao(osId, versao);
      const envelope = criarEnvelope(tipo, osId, {});
      await outbox.publicar(envelope);
      return envelope;
    });
  const pendentes = async () =>
    (
      await doc.send(
        new QueryCommand({
          TableName: TABELA_TESTE,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': 'OUTBOX' },
        }),
      )
    ).Items ?? [];

  beforeEach(async () => {
    await limparTabela(doc);
    enviados = [];
    enviar = jest.fn(async (_destino: string, envelope: MessageEnvelope) => {
      enviados.push(envelope);
    });
  });

  it('grava destino padrão (tópico), grupo e traceparent; destino explícito também', async () => {
    await gravar('os-1', 1, 't.a');
    await uow.run(async () => outbox.publicar(criarEnvelope('t.b', 'os-2', {}), 'https://sqs/fila.fifo'));
    const itens = await pendentes();
    expect(itens.map((i) => i.destination).sort()).toEqual([
      'arn:aws:sns:us-east-1:1:t.fifo',
      'https://sqs/fila.fifo',
    ]);
    expect(itens[0]).toMatchObject({ groupId: 'os-1', tentativas: 0 });
  });

  it('publica por OS em ordem de versão e apaga o que enviou', async () => {
    const v2 = await gravar('os-1', 2, 't.v2');
    const v1 = await gravar('os-1', 1, 't.v1');
    const outra = await gravar('os-2', 1, 't.outra');
    expect(await publicador().publicarPendentes()).toBe(3);
    const daOs1 = enviados.filter((e) => e.correlationId === 'os-1').map((e) => e.messageId);
    expect(daOs1).toEqual([v1.messageId, v2.messageId]);
    expect(enviados.map((e) => e.messageId)).toContain(outra.messageId);
    expect(await pendentes()).toHaveLength(0);
  });

  it('falha isola a OS: as seguintes dela esperam e registram tentativa; as outras seguem', async () => {
    const a1 = await gravar('os-a', 1, 't.a1');
    await gravar('os-a', 2, 't.a2');
    const b1 = await gravar('os-b', 1, 't.b1');
    enviar.mockImplementation(async (_d: string, e: MessageEnvelope) => {
      if (e.messageId === a1.messageId) throw new Error('sns fora');
      enviados.push(e);
    });
    expect(await publicador().publicarPendentes()).toBe(1);
    expect(enviados.map((e) => e.messageId)).toEqual([b1.messageId]);
    const restantes = await pendentes();
    expect(restantes).toHaveLength(2);
    expect(restantes[0]).toMatchObject({ tentativas: 1, ultimoErro: 'sns fora' });
  });

  it('OS sem falha anterior vai antes das que já falharam', async () => {
    const quebrada = await gravar('os-a', 1, 't.a');
    const saudavel = await gravar('os-z', 1, 't.z');
    enviar.mockImplementationOnce(async () => {
      throw new Error('falha 1');
    });
    const pub = publicador(); // mesmo dono do lease nos dois ciclos
    await pub.publicarPendentes(); // os-a falha (tentativas=1); os-z sai
    expect(enviados.map((e) => e.messageId)).toEqual([saudavel.messageId]);
    const nova = await gravar('os-m', 1, 't.m');
    enviados = [];
    enviar.mockImplementation(async (_d: string, e: MessageEnvelope) => {
      enviados.push(e);
    });
    await pub.publicarPendentes();
    expect(enviados.map((e) => e.messageId)).toEqual([nova.messageId, quebrada.messageId]);
  });

  it('lease: só um publicador por vez', async () => {
    await gravar('os-1', 1, 't.a');
    const lease = new OutboxLease(doc, dynamo);
    expect(await lease.adquirir()).toBe(true);
    expect(await publicador().publicarPendentes()).toBe(0); // outro dono, lease válido
    await lease.liberar();
    expect(await publicador().publicarPendentes()).toBe(1);
  });
});

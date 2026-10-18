import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Logger } from '@nestjs/common';
import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { mockClient } from 'aws-sdk-client-mock';

import { MetricasMensageria } from '../telemetry/metricas-mensageria';
import { MessageHandlerRegistry } from './message-handler.registry';
import { lerMessagingConfig } from './messaging.config';
import { SqsInboxConsumer } from './sqs-inbox.consumer';

const corpo = (messageId: string, correlationId: string) =>
  JSON.stringify({ messageId, type: 'x.v1', occurredAt: 'agora', correlationId, payload: {} });

describe('SqsInboxConsumer', () => {
  const sqs = mockClient(SQSClient);
  let registry: MessageHandlerRegistry;
  let handler: jest.Mock;
  let consumer: SqsInboxConsumer;
  let metricas: MetricasMensageria;
  let contar: jest.SpyInstance;

  beforeEach(() => {
    sqs.reset();
    metricas = new MetricasMensageria();
    contar = jest.spyOn(metricas, 'mensagemProcessada');
    registry = new MessageHandlerRegistry();
    handler = jest.fn().mockResolvedValue(undefined);
    registry.registrar('x.v1', handler);
    consumer = new SqsInboxConsumer(
      new SQSClient({}),
      lerMessagingConfig({ INBOX_QUEUE_URL: 'url-fila' }),
      registry,
      metricas,
    );
  });

  const receber = (
    ...mensagens: { id: string; corpo: string; grupo: string; traceparent?: string }[]
  ) =>
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: mensagens.map((m) => ({
        MessageId: m.id,
        ReceiptHandle: `rh-${m.id}`,
        Body: m.corpo,
        Attributes: { MessageGroupId: m.grupo },
        MessageAttributes: m.traceparent
          ? { traceparent: { DataType: 'String', StringValue: m.traceparent } }
          : undefined,
      })),
    });

  it('processa e apaga a mensagem da fila', async () => {
    receber({ id: '1', corpo: corpo('m1', 'os-1'), grupo: 'os-1' });
    await consumer.consumirLote();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(sqs.commandCalls(DeleteMessageCommand)[0].args[0].input).toEqual({
      QueueUrl: 'url-fila',
      ReceiptHandle: 'rh-1',
    });
  });

  it('não apaga mensagem com falha (volta para a fila e vai à DLQ após 3 tentativas)', async () => {
    handler.mockRejectedValueOnce(new Error('boom'));
    receber({ id: '1', corpo: corpo('m1', 'os-1'), grupo: 'os-1' });
    await consumer.consumirLote();
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(0);
  });

  it('não apaga mensagem fora do contrato', async () => {
    receber({ id: '1', corpo: '{lixo', grupo: 'os-1' });
    await consumer.consumirLote();
    expect(handler).not.toHaveBeenCalled();
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(0);
  });

  it('após falha, pula as próximas mensagens do mesmo grupo e segue com os outros', async () => {
    handler.mockRejectedValueOnce(new Error('boom'));
    receber(
      { id: '1', corpo: corpo('m1', 'os-1'), grupo: 'os-1' },
      { id: '2', corpo: corpo('m2', 'os-1'), grupo: 'os-1' },
      { id: '3', corpo: corpo('m3', 'os-2'), grupo: 'os-2' },
    );
    await consumer.consumirLote();
    expect(handler.mock.calls.map((c) => c[0].messageId)).toEqual(['m1', 'm3']);
    expect(sqs.commandCalls(DeleteMessageCommand).map((c) => c.args[0].input.ReceiptHandle)).toEqual([
      'rh-3',
    ]);
  });

  it('conta mensagens processadas por tipo e resultado', async () => {
    handler.mockRejectedValueOnce(new Error('boom'));
    receber(
      { id: '1', corpo: corpo('m1', 'os-1'), grupo: 'os-1' },
      { id: '2', corpo: corpo('m2', 'os-2'), grupo: 'os-2' },
      { id: '3', corpo: '{lixo', grupo: 'os-3' },
    );
    await consumer.consumirLote();
    expect(contar.mock.calls).toEqual([
      ['x.v1', 'erro'],
      ['x.v1', 'ok'],
      ['desconhecido', 'erro'],
    ]);
  });

  it('loga o sucesso com type, messageId, osId e duração', async () => {
    const logInfo = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    try {
      receber({ id: '1', corpo: corpo('m1', 'os-1'), grupo: 'os-1' });
      await consumer.consumirLote();
      expect(logInfo).toHaveBeenCalledWith({
        msg: 'Mensagem processada',
        type: 'x.v1',
        messageId: 'm1',
        osId: 'os-1',
        duracaoMs: expect.any(Number),
      });
    } finally {
      logInfo.mockRestore();
    }
  });

  describe('trace', () => {
    const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';

    beforeAll(() => {
      context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
      propagation.setGlobalPropagator(new W3CTraceContextPropagator());
      trace.setGlobalTracerProvider(new BasicTracerProvider());
    });
    afterAll(() => {
      trace.disable();
      propagation.disable();
      context.disable();
    });

    it('o handler roda com span ativo no trace do traceparent recebido', async () => {
      let traceIdNoHandler: string | undefined;
      handler.mockImplementationOnce(async () => {
        traceIdNoHandler = trace.getActiveSpan()?.spanContext().traceId;
      });
      receber({
        id: '1',
        corpo: corpo('m1', 'os-1'),
        grupo: 'os-1',
        traceparent: `00-${TRACE_ID}-b7ad6b7169203331-01`,
      });
      await consumer.consumirLote();
      expect(traceIdNoHandler).toBe(TRACE_ID);
    });
  });

  it('lote vazio não faz nada', async () => {
    sqs.on(ReceiveMessageCommand).resolves({});
    await consumer.consumirLote();
    expect(handler).not.toHaveBeenCalled();
  });

  it('não inicia o loop com a mensageria desligada', () => {
    const desligado = new SqsInboxConsumer(
      new SQSClient({}),
      lerMessagingConfig({ MESSAGING_ENABLED: 'false' }),
      registry,
      metricas,
    );
    desligado.onApplicationBootstrap();
    expect(sqs.commandCalls(ReceiveMessageCommand)).toHaveLength(0);
  });

  it('não apaga mensagem de tipo desconhecido', async () => {
    receber({
      id: '1',
      corpo: JSON.stringify({
        messageId: 'm1',
        type: 'desconhecido.v1',
        occurredAt: 'agora',
        correlationId: 'os-1',
        payload: {},
      }),
      grupo: 'os-1',
    });
    await consumer.consumirLote();
    expect(handler).not.toHaveBeenCalled();
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(0);
  });

  it('loga a falha estruturada com messageId, type, osId e sqsMessageId', async () => {
    const logErro = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      handler.mockRejectedValueOnce(new TypeError('boom'));
      receber({ id: '1', corpo: corpo('m1', 'os-1'), grupo: 'os-1' });
      await consumer.consumirLote();
      expect(logErro).toHaveBeenCalledWith({
        msg: 'Falha ao processar mensagem',
        messageId: 'm1',
        type: 'x.v1',
        osId: 'os-1',
        sqsMessageId: '1',
        err: { message: 'boom', name: 'TypeError' },
      });
    } finally {
      logErro.mockRestore();
    }
  });

  it('mensagem ilegível loga osId pelo MessageGroupId', async () => {
    const logErro = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      receber({ id: '9', corpo: 'nao-json', grupo: 'os-7' });
      await consumer.consumirLote();
      expect(logErro).toHaveBeenCalledWith(
        expect.objectContaining({ msg: 'Falha ao processar mensagem', osId: 'os-7', sqsMessageId: '9' }),
      );
      expect(logErro.mock.calls[0][0]).not.toHaveProperty('messageId', expect.anything());
    } finally {
      logErro.mockRestore();
    }
  });

  it('com a mensageria desligada, o encerramento resolve sem loop pendente', async () => {
    const desligado = new SqsInboxConsumer(
      new SQSClient({}),
      lerMessagingConfig({ MESSAGING_ENABLED: 'false' }),
      registry,
      metricas,
    );
    desligado.onApplicationBootstrap();
    await expect(desligado.beforeApplicationShutdown()).resolves.toBeUndefined();
    expect(sqs.commandCalls(ReceiveMessageCommand)).toHaveLength(0);
  });

  describe('ciclo de vida', () => {
    /** Receive é um long-poll que só termina quando o sinal é abortado, como o SDK faz. */
    const longPollAteAbortar = (comando: unknown, opcoes?: { abortSignal?: AbortSignal }) =>
      new Promise((resolve, reject) => {
        if (!(comando instanceof ReceiveMessageCommand)) return resolve({});
        opcoes?.abortSignal?.addEventListener('abort', () => {
          const erro = new Error('Request aborted');
          erro.name = 'AbortError';
          reject(erro);
        });
      });

    let send: jest.Mock;
    let logErro: jest.SpyInstance;
    let ligado: SqsInboxConsumer;

    beforeEach(() => {
      send = jest.fn(longPollAteAbortar);
      logErro = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      ligado = new SqsInboxConsumer(
        { send } as unknown as SQSClient,
        lerMessagingConfig({ INBOX_QUEUE_URL: 'url-fila' }),
        registry,
        metricas,
      );
    });
    afterEach(() => {
      logErro.mockRestore();
      jest.useRealTimers();
    });

    it('beforeApplicationShutdown aborta o long-poll pendente e resolve sem logar erro', async () => {
      ligado.onApplicationBootstrap();
      await new Promise((resolve) => setImmediate(resolve));
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][1]?.abortSignal).toBeDefined();

      await ligado.beforeApplicationShutdown();

      expect(send).toHaveBeenCalledTimes(1);
      expect(logErro).not.toHaveBeenCalled();
    });

    it('beforeApplicationShutdown espera o lote em processamento terminar', async () => {
      let liberarHandler!: () => void;
      handler.mockReturnValueOnce(new Promise<void>((resolve) => (liberarHandler = resolve)));
      send.mockResolvedValueOnce({
        Messages: [
          {
            MessageId: '1',
            ReceiptHandle: 'rh-1',
            Body: corpo('m1', 'os-1'),
            Attributes: { MessageGroupId: 'os-1' },
          },
        ],
      });
      ligado.onApplicationBootstrap();
      await new Promise((resolve) => setImmediate(resolve));
      expect(handler).toHaveBeenCalledTimes(1);

      let encerrado = false;
      const encerramento = ligado.beforeApplicationShutdown().then(() => (encerrado = true));
      await new Promise((resolve) => setImmediate(resolve));
      expect(encerrado).toBe(false);

      liberarHandler();
      await encerramento;
      const deletes = send.mock.calls.filter(([comando]) => comando instanceof DeleteMessageCommand);
      expect(deletes).toHaveLength(1);
      expect(logErro).not.toHaveBeenCalled();
    });

    it('falha no Receive loga e espera 1s antes de tentar de novo', async () => {
      jest.useFakeTimers();
      send.mockRejectedValueOnce(new Error('rede fora'));
      ligado.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(1);
      expect(logErro).toHaveBeenCalledTimes(1);
      expect(logErro).toHaveBeenCalledWith({
        msg: 'Falha ao ler a fila de entrada',
        err: { message: 'rede fora', name: 'Error' },
      });

      await jest.advanceTimersByTimeAsync(999);
      expect(send).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(send).toHaveBeenCalledTimes(2);

      await ligado.beforeApplicationShutdown();
      expect(logErro).toHaveBeenCalledTimes(1);
    });
  });
});

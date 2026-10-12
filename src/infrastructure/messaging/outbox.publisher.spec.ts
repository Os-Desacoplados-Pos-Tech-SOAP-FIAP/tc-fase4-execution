import { performance } from 'node:perf_hooks';

import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@nestjs/common';

import { lerDynamoConfig } from '../dynamo/dynamo.config';
import { lerMessagingConfig } from './messaging.config';
import { DURACAO_LEASE_MS, OutboxLease } from './outbox-lease';
import { MARGEM_SEGURANCA_LEASE_MS, OutboxPublisher } from './outbox.publisher';
import { SnsSqsTransport } from './sns-sqs.transport';

function adiado() {
  let resolver!: (valor: number) => void;
  const promessa = new Promise<number>((resolve) => (resolver = resolve));
  return { promessa, resolver };
}

describe('OutboxPublisher (ciclo de vida)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const criar = (enabled: boolean) => {
    const lease = {
      adquirir: jest.fn().mockResolvedValue(true),
      liberar: jest.fn().mockResolvedValue(undefined),
    };
    const publisher = new OutboxPublisher(
      {} as never,
      {} as never,
      lease as unknown as OutboxLease,
      lerDynamoConfig({}),
      lerMessagingConfig({ MESSAGING_ENABLED: String(enabled) }),
    );
    const publicar = jest.spyOn(publisher, 'publicarPendentes').mockResolvedValue(0);
    return { publisher, publicar, lease };
  };

  it('publica a cada segundo enquanto a aplicação está no ar', async () => {
    const { publisher, publicar } = criar(true);
    publisher.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(3000);
    expect(publicar).toHaveBeenCalledTimes(3);
    await publisher.beforeApplicationShutdown();
    await jest.advanceTimersByTimeAsync(3000);
    expect(publicar).toHaveBeenCalledTimes(3);
  });

  it('não agenda nada com a mensageria desligada', async () => {
    const { publisher, publicar } = criar(false);
    publisher.onApplicationBootstrap();
    jest.advanceTimersByTime(3000);
    expect(publicar).not.toHaveBeenCalled();
    await publisher.beforeApplicationShutdown();
  });

  it('beforeApplicationShutdown libera o lease só com a mensageria ligada', async () => {
    const ligada = criar(true);
    ligada.publisher.onApplicationBootstrap();
    await ligada.publisher.beforeApplicationShutdown();
    expect(ligada.lease.liberar).toHaveBeenCalledTimes(1);

    const desligada = criar(false);
    desligada.publisher.onApplicationBootstrap();
    await desligada.publisher.beforeApplicationShutdown();
    expect(desligada.lease.liberar).not.toHaveBeenCalled();
  });

  it('erro num ciclo não derruba os próximos', async () => {
    const { publisher, publicar } = criar(true);
    publicar.mockRejectedValueOnce(new Error('sns fora'));
    const logErro = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      publisher.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(2000);
      expect(publicar).toHaveBeenCalledTimes(2);
      expect(logErro).toHaveBeenCalledWith({
        msg: 'Falha ao publicar a outbox',
        err: { message: 'sns fora', name: 'Error' },
      });
      await publisher.beforeApplicationShutdown();
    } finally {
      logErro.mockRestore();
    }
  });

  it('ciclo lento não se sobrepõe ao próximo', async () => {
    const { publisher, publicar } = criar(true);
    const lento = adiado();
    publicar.mockReturnValueOnce(lento.promessa);
    publisher.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(3000);
    expect(publicar).toHaveBeenCalledTimes(1);

    lento.resolver(0);
    await jest.advanceTimersByTimeAsync(1000);
    expect(publicar).toHaveBeenCalledTimes(2);
    await publisher.beforeApplicationShutdown();
  });

  it('beforeApplicationShutdown espera o ciclo em andamento terminar', async () => {
    const { publisher, publicar, lease } = criar(true);
    const lento = adiado();
    publicar.mockReturnValueOnce(lento.promessa);
    publisher.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(1000);

    let encerrado = false;
    const encerramento = publisher.beforeApplicationShutdown().then(() => (encerrado = true));
    await jest.advanceTimersByTimeAsync(5000);
    expect(encerrado).toBe(false);
    expect(publicar).toHaveBeenCalledTimes(1);
    expect(lease.liberar).not.toHaveBeenCalled();

    lento.resolver(0);
    await encerramento;
    expect(encerrado).toBe(true);
    expect(lease.liberar).toHaveBeenCalledTimes(1);
  });
});

describe('OutboxPublisher (prazo do lease)', () => {
  const limite = DURACAO_LEASE_MS - MARGEM_SEGURANCA_LEASE_MS;
  let agora: number;

  beforeEach(() => {
    agora = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => agora);
  });
  afterEach(() => jest.restoreAllMocks());

  const criar = (adquirir: () => Promise<boolean>, enviar: () => Promise<void>) => {
    const itens = [1, 2, 3, 4, 5].map((n) => ({
      PK: 'OUTBOX',
      SK: `os-${n}#0000000001#000#m-${n}`,
      groupId: `os-${n}`,
      type: 't',
      destination: 'arn',
      body: { messageId: `m-${n}` },
      tentativas: 0,
    }));
    const doc = {
      send: jest.fn(async (comando: unknown) => (comando instanceof QueryCommand ? { Items: itens } : {})),
    };
    const transporte = { enviar: jest.fn(enviar) };
    const publisher = new OutboxPublisher(
      doc as unknown as DynamoDBDocumentClient,
      transporte as unknown as SnsSqsTransport,
      { adquirir: jest.fn(adquirir) } as unknown as OutboxLease,
      lerDynamoConfig({}),
      lerMessagingConfig({}),
    );
    return { publisher, transporte };
  };

  it('para de iniciar envios quando o tempo do ciclo passa do limite seguro do lease', async () => {
    const { publisher, transporte } = criar(
      async () => true,
      async () => {
        agora += limite * 0.4; // envios em 0, 0,4L e 0,8L; o quarto (1,2L) já passou do limite
      },
    );
    expect(await publisher.publicarPendentes()).toBe(3);
    expect(transporte.enviar).toHaveBeenCalledTimes(3);
  });

  it('conta o tempo gasto para adquirir o lease', async () => {
    const { publisher, transporte } = criar(
      async () => {
        agora += limite + 1;
        return true;
      },
      async () => undefined,
    );
    expect(await publisher.publicarPendentes()).toBe(0);
    expect(transporte.enviar).not.toHaveBeenCalled();
  });
});

import { Logger } from '@nestjs/common';

import { lerDynamoConfig } from '../dynamo/dynamo.config';
import { lerMessagingConfig } from './messaging.config';
import { OutboxLease } from './outbox-lease';
import { OutboxPublisher } from './outbox.publisher';

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

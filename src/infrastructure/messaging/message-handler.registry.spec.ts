import { MessageHandlerRegistry, TipoDeMensagemDesconhecidoError } from './message-handler.registry';

describe('MessageHandlerRegistry', () => {
  const envelope = { messageId: 'm1', type: 'x.v1', occurredAt: '', correlationId: 'os', payload: {} };

  it('despacha para o handler do tipo', async () => {
    const registry = new MessageHandlerRegistry();
    const handler = jest.fn().mockResolvedValue(undefined);
    registry.registrar('x.v1', handler);
    await registry.despachar(envelope);
    expect(handler).toHaveBeenCalledWith(envelope);
  });

  it('rejeita tipo sem handler', async () => {
    await expect(new MessageHandlerRegistry().despachar(envelope)).rejects.toBeInstanceOf(
      TipoDeMensagemDesconhecidoError,
    );
  });
});

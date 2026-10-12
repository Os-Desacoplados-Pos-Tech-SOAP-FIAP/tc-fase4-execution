import { criarEnvelope } from './message-envelope';

describe('criarEnvelope', () => {
  it('monta envelope com id único, data ISO, correlação e causa', () => {
    const a = criarEnvelope('catalog.x.v1', 'os-1', { ok: true }, 'msg-origem');
    const b = criarEnvelope('catalog.x.v1', 'os-1', { ok: true });
    expect(a).toEqual({
      messageId: expect.any(String),
      type: 'catalog.x.v1',
      occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      correlationId: 'os-1',
      causationId: 'msg-origem',
      payload: { ok: true },
    });
    expect(a.messageId).not.toBe(b.messageId);
    expect(b.causationId).toBeUndefined();
  });
});

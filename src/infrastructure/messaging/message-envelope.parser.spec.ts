import { lerEnvelope, MensagemInvalidaError } from './message-envelope.parser';

const valido = {
  messageId: 'm1',
  type: 'execution.enfileirar-execucao.v1',
  occurredAt: '2026-10-20T10:00:00.000Z',
  correlationId: 'os-1',
  payload: { itens: [] },
};

describe('lerEnvelope', () => {
  it('aceita envelope válido e ignora campos extras (tolerant reader)', () => {
    expect(lerEnvelope(JSON.stringify({ ...valido, extra: 1 }))).toMatchObject(valido);
  });

  it.each([
    ['corpo vazio', undefined],
    ['JSON malformado', '{nao-json'],
    ['não é objeto', '"texto"'],
    ['sem messageId', JSON.stringify({ ...valido, messageId: '' })],
    ['sem type', JSON.stringify({ ...valido, type: undefined })],
    ['sem payload', JSON.stringify({ ...valido, payload: null })],
  ])('rejeita %s', (_caso, corpo) => {
    expect(() => lerEnvelope(corpo)).toThrow(MensagemInvalidaError);
  });
});

import { validarAmbiente } from './env.validation';

describe('validarAmbiente', () => {
  const base = { DYNAMO_TABLE: 't', JWT_SECRET: 's' };

  it('aceita o mínimo com a mensageria desligada', () => {
    expect(validarAmbiente({ ...base, MESSAGING_ENABLED: 'false' })).toMatchObject(base);
  });

  it('exige fila e tópico com a mensageria ligada', () => {
    expect(() => validarAmbiente(base)).toThrow(
      'Variáveis de ambiente ausentes: INBOX_QUEUE_URL, EVENTS_TOPIC_ARN',
    );
  });

  it('exige banco e segredo do JWT', () => {
    expect(() => validarAmbiente({ MESSAGING_ENABLED: 'false' })).toThrow('JWT_SECRET, DYNAMO_TABLE');
  });

  it('rejeita capacidade inválida', () => {
    expect(() =>
      validarAmbiente({ JWT_SECRET: 's', DYNAMO_TABLE: 't', MESSAGING_ENABLED: 'false', EXECUTION_MAX_CONCURRENT: '0' }),
    ).toThrow('EXECUTION_MAX_CONCURRENT');
  });
});

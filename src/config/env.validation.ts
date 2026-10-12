const OBRIGATORIAS = ['JWT_SECRET', 'DYNAMO_TABLE'];
const OBRIGATORIAS_MENSAGERIA = ['INBOX_QUEUE_URL', 'EVENTS_TOPIC_ARN'];

/** Falha no boot se faltar configuração, em vez de quebrar na primeira requisição. */
export function validarAmbiente(config: Record<string, unknown>): Record<string, unknown> {
  const exigidas =
    config.MESSAGING_ENABLED === 'false'
      ? OBRIGATORIAS
      : [...OBRIGATORIAS, ...OBRIGATORIAS_MENSAGERIA];
  const ausentes = exigidas.filter((chave) => !config[chave]);
  if (ausentes.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${ausentes.join(', ')}`);
  }
  const maximo = config.EXECUTION_MAX_CONCURRENT;
  if (maximo !== undefined && !(Number.isInteger(Number(maximo)) && Number(maximo) > 0)) {
    throw new Error('EXECUTION_MAX_CONCURRENT deve ser inteiro positivo');
  }
  return config;
}

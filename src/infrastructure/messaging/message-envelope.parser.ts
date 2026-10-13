import { MessageEnvelope } from '../../application/ports/message-envelope';

/** Mensagem fora do contrato: não é reprocessável, termina na DLQ. */
export class MensagemInvalidaError extends Error {
  constructor(motivo: string) {
    super(`Mensagem inválida: ${motivo}`);
    this.name = 'MensagemInvalidaError';
  }
}

const CAMPOS_TEXTO = ['messageId', 'type', 'occurredAt', 'correlationId'] as const;

export function lerEnvelope(corpo: string | undefined): MessageEnvelope {
  if (!corpo) throw new MensagemInvalidaError('corpo vazio');

  let dado: unknown;
  try {
    dado = JSON.parse(corpo);
  } catch {
    throw new MensagemInvalidaError('JSON malformado');
  }
  if (typeof dado !== 'object' || dado === null) {
    throw new MensagemInvalidaError('corpo não é um objeto');
  }

  const campos = dado as Record<string, unknown>;
  for (const campo of CAMPOS_TEXTO) {
    if (typeof campos[campo] !== 'string' || campos[campo] === '') {
      throw new MensagemInvalidaError(`campo ${campo} ausente`);
    }
  }
  if (typeof campos.payload !== 'object' || campos.payload === null) {
    throw new MensagemInvalidaError('payload ausente');
  }
  return dado as MessageEnvelope;
}

import { randomUUID } from 'node:crypto';

/** Envelope padrão de todas as mensagens entre serviços (spec §4.7). */
export interface MessageEnvelope<TPayload = unknown> {
  messageId: string;
  type: string;
  occurredAt: string;
  /** Id da OS — liga todas as mensagens à mesma saga e é o MessageGroupId FIFO. */
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}

/** Identificação da mensagem que originou um caso de uso disparado pela fila. */
export interface ContextoMensagem {
  messageId: string;
  correlationId: string;
}

export function criarEnvelope<TPayload>(
  type: string,
  correlationId: string,
  payload: TPayload,
  causationId?: string,
): MessageEnvelope<TPayload> {
  return {
    messageId: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    correlationId,
    causationId,
    payload,
  };
}

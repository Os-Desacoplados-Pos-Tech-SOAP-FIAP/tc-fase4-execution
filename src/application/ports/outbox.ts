import { MessageEnvelope } from './message-envelope';

/**
 * Grava um evento/comando para publicação, na transação corrente. Sem `destino`, vai para
 * o tópico de eventos do serviço; com ele, para outro tópico (ARN) ou fila de comando (URL).
 */
export interface IOutbox {
  publicar(envelope: MessageEnvelope, destino?: string): Promise<void>;
}

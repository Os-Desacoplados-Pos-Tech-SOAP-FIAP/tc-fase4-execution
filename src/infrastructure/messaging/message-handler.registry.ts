import { Injectable } from '@nestjs/common';

import { MessageEnvelope } from '../../application/ports/message-envelope';

export type MessageHandler = (envelope: MessageEnvelope) => Promise<void>;

export class TipoDeMensagemDesconhecidoError extends Error {
  constructor(tipo: string) {
    super(`Nenhum handler para o tipo de mensagem ${tipo}`);
    this.name = 'TipoDeMensagemDesconhecidoError';
  }
}

@Injectable()
export class MessageHandlerRegistry {
  private readonly handlers = new Map<string, MessageHandler>();

  registrar(tipo: string, handler: MessageHandler): void {
    this.handlers.set(tipo, handler);
  }

  async despachar(envelope: MessageEnvelope): Promise<void> {
    const handler = this.handlers.get(envelope.type);
    if (!handler) throw new TipoDeMensagemDesconhecidoError(envelope.type);
    await handler(envelope);
  }
}

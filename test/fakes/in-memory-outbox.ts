import { MessageEnvelope } from '../../src/application/ports/message-envelope';
import { IOutbox } from '../../src/application/ports/outbox';
import { ParticipanteTransacao } from './fake-transaction.manager';

export class InMemoryOutbox implements IOutbox, ParticipanteTransacao {
  public mensagens: MessageEnvelope[] = [];

  async publicar(envelope: MessageEnvelope): Promise<void> {
    this.mensagens.push(envelope);
  }
  tipos(): string[] {
    return this.mensagens.map((m) => m.type);
  }
  snapshot(): unknown {
    return [...this.mensagens];
  }
  restaurar(estado: unknown): void {
    this.mensagens = estado as MessageEnvelope[];
  }
}

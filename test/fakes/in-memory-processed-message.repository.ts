import { IProcessedMessageRepository } from '../../src/application/ports/processed-message.repository';
import { ParticipanteTransacao } from './fake-transaction.manager';

export class InMemoryProcessedMessageRepository
  implements IProcessedMessageRepository, ParticipanteTransacao
{
  public ids = new Set<string>();

  async registrar(messageId: string): Promise<boolean> {
    if (this.ids.has(messageId)) return false;
    this.ids.add(messageId);
    return true;
  }
  snapshot(): unknown {
    return new Set(this.ids);
  }
  restaurar(estado: unknown): void {
    this.ids = estado as Set<string>;
  }
}

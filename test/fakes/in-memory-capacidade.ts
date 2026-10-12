import { ICapacidadeExecucao } from '../../src/application/ports/capacidade';
import { DomainError } from '../../src/domain/shared/DomainError';
import { ParticipanteTransacao } from './fake-transaction.manager';

/** Espelha as condições do DynamoCapacidade: limite no ocupar e `ativos > 0` no liberar. */
export class InMemoryCapacidade implements ICapacidadeExecucao, ParticipanteTransacao {
  public ocupadas = 0;
  async ativos(): Promise<number> {
    return this.ocupadas;
  }
  async ocupar(maximo: number): Promise<void> {
    if (this.ocupadas >= maximo) {
      throw new DomainError('Capacidade de execução esgotada', 'CAPACIDADE_ESGOTADA');
    }
    this.ocupadas += 1;
  }
  async liberar(): Promise<void> {
    if (this.ocupadas <= 0) throw new Error('capacidade já está zerada');
    this.ocupadas -= 1;
  }
  snapshot(): unknown {
    return this.ocupadas;
  }
  restaurar(estado: unknown): void {
    this.ocupadas = estado as number;
  }
}

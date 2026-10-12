import { ICapacidadeExecucao } from '../../src/application/ports/capacidade';
import { ParticipanteTransacao } from './fake-transaction.manager';

export class InMemoryCapacidade implements ICapacidadeExecucao, ParticipanteTransacao {
  public ocupadas = 0;
  async ativos(): Promise<number> {
    return this.ocupadas;
  }
  async ocupar(maximo: number): Promise<void> {
    if (this.ocupadas >= maximo) throw new Error('capacidade esgotada na gravação');
    this.ocupadas += 1;
  }
  async liberar(): Promise<void> {
    this.ocupadas = Math.max(0, this.ocupadas - 1);
  }
  snapshot(): unknown {
    return this.ocupadas;
  }
  restaurar(estado: unknown): void {
    this.ocupadas = estado as number;
  }
}

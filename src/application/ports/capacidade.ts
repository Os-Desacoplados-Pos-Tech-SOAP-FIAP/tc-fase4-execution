/** Limite de OS em reparo simultâneo (regra de negócio do pivô da saga). */
export interface ICapacidadeExecucao {
  ativos(): Promise<number>;
  /** Ocupa uma vaga na transação corrente, condicionada a `ativos < maximo`. */
  ocupar(maximo: number): Promise<void>;
  /** Libera uma vaga na transação corrente. */
  liberar(): Promise<void>;
}

/** Executa o trabalho numa transação; repositórios e outbox participam dela. */
export interface ITransactionManager {
  run<T>(work: () => Promise<T>): Promise<T>;
}

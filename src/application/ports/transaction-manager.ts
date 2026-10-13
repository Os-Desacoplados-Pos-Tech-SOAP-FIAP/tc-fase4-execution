/**
 * Executa o trabalho numa transação; repositórios e outbox participam dela.
 *
 * As escritas só ficam visíveis depois do commit (no DynamoDB elas são acumuladas e
 * enviadas juntas no fim): dentro do mesmo `run`, não leia o que acabou de escrever —
 * a leitura devolve o estado anterior à transação.
 */
export interface ITransactionManager {
  run<T>(work: () => Promise<T>): Promise<T>;
}

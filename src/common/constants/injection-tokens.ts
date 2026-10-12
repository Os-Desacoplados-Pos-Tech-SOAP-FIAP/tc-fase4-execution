export const INJECTION_TOKENS = {
  ORDEM_EXECUCAO_REPOSITORY: Symbol('IOrdemExecucaoRepository'),
  CAPACIDADE_EXECUCAO: Symbol('ICapacidadeExecucao'),
  METRICAS_EXECUCAO: Symbol('IMetricasExecucao'),
  PROCESSED_MESSAGE_REPOSITORY: Symbol('IProcessedMessageRepository'),
  OUTBOX: Symbol('IOutbox'),
  TRANSACTION_MANAGER: Symbol('ITransactionManager'),
  RELOGIO: Symbol('IRelogio'),
  CONFIG_EXECUCAO: Symbol('ConfigExecucao'),
} as const;

export interface ConfigExecucao {
  capacidadeMaxima: number;
}

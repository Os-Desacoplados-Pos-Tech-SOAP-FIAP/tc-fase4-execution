export const INJECTION_TOKENS = {
  SERVICO_REPOSITORY: Symbol('IServicoRepository'),
  INSUMO_REPOSITORY: Symbol('IInsumoLockingRepository'),
  RESERVA_REPOSITORY: Symbol('IReservaRepository'),
  PROCESSED_MESSAGE_REPOSITORY: Symbol('IProcessedMessageRepository'),
  OUTBOX: Symbol('IOutbox'),
  TRANSACTION_MANAGER: Symbol('ITransactionManager'),
} as const;

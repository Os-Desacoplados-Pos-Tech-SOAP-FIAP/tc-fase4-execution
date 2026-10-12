export const EVENTS = {
  ESTOQUE_BAIXADO: Symbol.for('estoque.baixado'),
  ESTOQUE_RESERVADO: Symbol.for('estoque.reservado'),
  ESTOQUE_RESERVA_LIBERADA: Symbol.for('estoque.reserva_liberada'),
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

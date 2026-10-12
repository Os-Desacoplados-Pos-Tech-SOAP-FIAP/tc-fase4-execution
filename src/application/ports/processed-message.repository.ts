/** Registro de idempotência de mensagens recebidas. */
export interface IProcessedMessageRepository {
  /** Retorna `false` se a mensagem já tinha sido processada. */
  registrar(messageId: string): Promise<boolean>;
}

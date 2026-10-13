import { ConflitoError } from '../../application/errors';

/** Condição do DynamoDB violada no commit (versão, capacidade ou mensagem já gravada). */
export class ConcorrenciaError extends ConflitoError {
  constructor(detalhe: string) {
    super(`Conflito de concorrência: ${detalhe}`, 'CONCORRENCIA');
    this.name = 'ConcorrenciaError';
    Object.setPrototypeOf(this, ConcorrenciaError.prototype);
  }
}

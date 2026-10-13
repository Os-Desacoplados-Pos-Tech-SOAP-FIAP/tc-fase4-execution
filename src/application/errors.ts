/**
 * Erros da camada de aplicação: independentes de HTTP e fora da hierarquia de
 * DomainError, pois não representam regra de negócio violada (422), e sim
 * recurso ausente (404) ou conflito de estado (409). O mapeamento para status
 * fica na borda (AllExceptionsFilter).
 */
export class RecursoNaoEncontradoError extends Error {
  public readonly code = 'RECURSO_NAO_ENCONTRADO';

  constructor(entidade: string) {
    super(`${entidade} não encontrado(a)`);
    this.name = 'RecursoNaoEncontradoError';
    Object.setPrototypeOf(this, RecursoNaoEncontradoError.prototype);
  }
}

export class ConflitoError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'CONFLITO') {
    super(message);
    this.name = 'ConflitoError';
    this.code = code;
    Object.setPrototypeOf(this, ConflitoError.prototype);
  }
}

import { DomainError } from '../domain/shared/DomainError';
import { ConflitoError, RecursoNaoEncontradoError } from './errors';

describe('erros de aplicação', () => {
  it('RecursoNaoEncontradoError monta a mensagem a partir da entidade', () => {
    const erro = new RecursoNaoEncontradoError('Serviço');
    expect(erro).toBeInstanceOf(Error);
    expect(erro).not.toBeInstanceOf(DomainError);
    expect(erro.name).toBe('RecursoNaoEncontradoError');
    expect(erro.code).toBe('RECURSO_NAO_ENCONTRADO');
    expect(erro.message).toBe('Serviço não encontrado(a)');
  });

  it('ConflitoError usa CONFLITO como code padrão', () => {
    const erro = new ConflitoError('Já existe');
    expect(erro).not.toBeInstanceOf(DomainError);
    expect(erro.name).toBe('ConflitoError');
    expect(erro.code).toBe('CONFLITO');
    expect(erro.message).toBe('Já existe');
  });

  it('ConflitoError aceita code específico', () => {
    expect(new ConflitoError('Duplicado', 'INSUMO_CODIGO_DUPLICADO').code).toBe('INSUMO_CODIGO_DUPLICADO');
  });
});

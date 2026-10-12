import { DomainError } from '../domain/shared/DomainError';
import { ensureFound } from './ensure-found';
import { RecursoNaoEncontradoError } from './errors';

describe('ensureFound', () => {
  it('retorna o valor quando não é null/undefined', () => {
    expect(ensureFound('x', 'Item')).toBe('x');
    expect(ensureFound(0, 'Item')).toBe(0);
    expect(ensureFound(false, 'Item')).toBe(false);
  });

  it('lança RecursoNaoEncontradoError quando null', () => {
    expect(() => ensureFound(null, 'Cliente')).toThrow(RecursoNaoEncontradoError);
    expect(() => ensureFound(null, 'Cliente')).toThrow('Cliente não encontrado(a)');
  });

  it('lança RecursoNaoEncontradoError quando undefined', () => {
    expect(() => ensureFound(undefined, 'OS')).toThrow(RecursoNaoEncontradoError);
  });

  it('o erro tem code próprio e não é erro de domínio', () => {
    let capturado: unknown;
    try {
      ensureFound(null, 'OS');
    } catch (erro) {
      capturado = erro;
    }
    expect(capturado).toBeInstanceOf(RecursoNaoEncontradoError);
    expect((capturado as RecursoNaoEncontradoError).code).toBe('RECURSO_NAO_ENCONTRADO');
    expect(capturado).not.toBeInstanceOf(DomainError);
  });
});

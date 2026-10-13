import { RecursoNaoEncontradoError } from './errors';

export function ensureFound<T>(value: T | null | undefined, entidade: string): T {
  if (value === null || value === undefined) {
    throw new RecursoNaoEncontradoError(entidade);
  }
  return value;
}

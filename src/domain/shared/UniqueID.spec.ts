import { DomainError } from './DomainError';
import { UniqueID } from './UniqueID';

describe('UniqueID', () => {
  it('gera UUID válido quando nenhum valor é passado', () => {
    const id = new UniqueID();
    expect(id.toString()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('aceita UUID válido passado por parâmetro', () => {
    const raw = '123e4567-e89b-12d3-a456-426614174000';
    const id = new UniqueID(raw);
    expect(id.toValue()).toBe(raw);
  });

  it('lança DomainError para UUID inválido', () => {
    expect(() => new UniqueID('nao-e-uuid')).toThrow(DomainError);
  });

  it('toString retorna o valor string', () => {
    const raw = '123e4567-e89b-12d3-a456-426614174000';
    const id = new UniqueID(raw);
    expect(id.toString()).toBe(raw);
  });

  it('equals retorna false quando comparado com undefined', () => {
    const id = new UniqueID();
    expect(id.equals(undefined)).toBe(false);
  });

  it('equals retorna true para IDs com mesmo valor', () => {
    const raw = '123e4567-e89b-12d3-a456-426614174000';
    expect(new UniqueID(raw).equals(new UniqueID(raw))).toBe(true);
  });

  it('equals retorna false para IDs diferentes', () => {
    expect(new UniqueID().equals(new UniqueID())).toBe(false);
  });
});

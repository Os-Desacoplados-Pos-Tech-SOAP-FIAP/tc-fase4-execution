import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { DomainError } from './DomainError';

export class UniqueID {
  private readonly value: string;

  constructor(value?: string) {
    const id = value ?? uuidv4();
    if (!uuidValidate(id)) {
      throw new DomainError(`ID inválido: "${id}"`, 'INVALID_ID');
    }
    this.value = id;
  }

  public toString(): string {
    return this.value;
  }

  public toValue(): string {
    return this.value;
  }

  public equals(other?: UniqueID): boolean {
    if (!other) return false;
    return this.value === other.value;
  }
}

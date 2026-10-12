import { UniqueID } from './UniqueID';

export interface EntityProps {
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export abstract class Entity<T extends EntityProps> {
  protected readonly _id: UniqueID;
  protected props: T;

  protected constructor(props: T, id?: UniqueID) {
    this._id = id ?? new UniqueID();
    const now = new Date();
    this.props = {
      ...props,
      criadoEm: props.criadoEm ?? now,
      atualizadoEm: props.atualizadoEm ?? now,
    };
  }

  public get id(): UniqueID {
    return this._id;
  }

  public get criadoEm(): Date {
    return this.props.criadoEm as Date;
  }

  public get atualizadoEm(): Date {
    return this.props.atualizadoEm as Date;
  }

  protected touch(): void {
    this.props.atualizadoEm = new Date();
  }

  public equals(other?: Entity<T>): boolean {
    if (!other) return false;
    return this._id.equals(other._id);
  }
}

import { v4 as uuid } from 'uuid';

import { UniqueID } from './UniqueID';

export interface DomainEvent {
  readonly eventId: string;
  readonly name: symbol;
  readonly ocorridoEm: Date;
  readonly aggregateId: UniqueID;
  readonly eventName: string;
}

export abstract class BaseDomainEvent implements DomainEvent {
  public readonly eventId: string = uuid();
  public readonly ocorridoEm: Date = new Date();

  constructor(
    public readonly aggregateId: UniqueID,
    public readonly name: symbol,
    public readonly eventName: string,
  ) {}
}

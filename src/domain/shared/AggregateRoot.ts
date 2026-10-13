import { DomainEvent } from './DomainEvent';
import { Entity, EntityProps } from './Entity';

export abstract class AggregateRoot<T extends EntityProps> extends Entity<T> {
  private _domainEvents: DomainEvent[] = [];

  public get domainEvents(): ReadonlyArray<DomainEvent> {
    return this._domainEvents;
  }

  public addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  public pullEvents(): DomainEvent[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }

  public clearEvents(): void {
    this._domainEvents = [];
  }
}

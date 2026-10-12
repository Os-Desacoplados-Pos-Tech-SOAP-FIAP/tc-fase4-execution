import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';

import { ICapacidadeExecucao } from '../../application/ports/capacidade';
import { DomainError } from '../../domain/shared/DomainError';
import { chaves } from '../dynamo/chaves';
import { DYNAMO_CONFIG, DynamoConfig } from '../dynamo/dynamo.config';
import { DynamoUnitOfWork } from '../dynamo/dynamo-unit-of-work';

/** Contador atômico: a condição no commit impede duas réplicas de passarem do limite. */
@Injectable()
export class DynamoCapacidade implements ICapacidadeExecucao {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly uow: DynamoUnitOfWork,
    @Inject(DYNAMO_CONFIG) private readonly config: DynamoConfig,
  ) {}

  async ativos(): Promise<number> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.config.tabela, Key: chaves.capacidade, ConsistentRead: true }),
    );
    return (Item?.ativos as number | undefined) ?? 0;
  }

  /** Vaga tomada por outra réplica entre a leitura e o commit é recusa de negócio, não retentativa. */
  async ocupar(maximo: number): Promise<void> {
    this.uow.adicionar(
      {
        Update: {
          TableName: this.config.tabela,
          Key: chaves.capacidade,
          UpdateExpression: 'ADD ativos :um',
          ConditionExpression: 'attribute_not_exists(ativos) OR ativos < :maximo',
          ExpressionAttributeValues: { ':um': 1, ':maximo': maximo },
        },
      },
      () => new DomainError('Capacidade de execução esgotada', 'CAPACIDADE_ESGOTADA'),
    );
  }

  async liberar(): Promise<void> {
    this.uow.adicionar({
      Update: {
        TableName: this.config.tabela,
        Key: chaves.capacidade,
        UpdateExpression: 'ADD ativos :menosUm',
        ConditionExpression: 'ativos > :zero',
        ExpressionAttributeValues: { ':menosUm': -1, ':zero': 0 },
      },
    });
  }
}

import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';

import { IProcessedMessageRepository } from '../../application/ports/processed-message.repository';
import { chaves } from '../dynamo/chaves';
import { DYNAMO_CONFIG, DynamoConfig } from '../dynamo/dynamo.config';
import { DynamoUnitOfWork } from '../dynamo/dynamo-unit-of-work';

const RETENCAO_SEGUNDOS = 7 * 24 * 60 * 60;

/**
 * Lê para decidir já (o caso de uso precisa saber se pula) e grava condicionalmente na
 * transação: duas entregas simultâneas passam pela leitura, mas só uma confirma; a outra
 * vira ConcorrenciaError e, na retentativa, a leitura já a encontra.
 */
@Injectable()
export class DynamoProcessedMessageRepository implements IProcessedMessageRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly uow: DynamoUnitOfWork,
    @Inject(DYNAMO_CONFIG) private readonly config: DynamoConfig,
  ) {}

  async registrar(messageId: string): Promise<boolean> {
    const chave = chaves.mensagem(messageId);
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.config.tabela, Key: chave, ConsistentRead: true }),
    );
    if (Item) return false;
    this.uow.adicionar({
      Put: {
        TableName: this.config.tabela,
        Item: { ...chave, expiraEm: Math.floor(Date.now() / 1000) + RETENCAO_SEGUNDOS },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    });
    return true;
  }
}

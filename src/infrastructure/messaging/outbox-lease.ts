import { randomUUID } from 'node:crypto';

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';

import { chaves } from '../dynamo/chaves';
import { DYNAMO_CONFIG, DynamoConfig } from '../dynamo/dynamo.config';

/**
 * Maior que o pior ciclo, contado desde antes de adquirir o lease: novos envios só começam
 * até 30s - 28s = 2s; o último item leva no pior caso ~27s (envio SNS/SQS 2 × (2s + 3s) +
 * Update/Delete no Dynamo 3 × (2s + 3s) + recuos de throttling do SDK de até ~2s). Ver MARGEM_SEGURANCA_LEASE_MS em
 * outbox.publisher.ts. Não cobre diferença de relógio entre réplicas.
 */
export const DURACAO_LEASE_MS = 30_000;

/** Elege um único publicador da outbox entre as réplicas (substitui o advisory lock do Postgres). */
@Injectable()
export class OutboxLease {
  private readonly dono = randomUUID();

  constructor(
    private readonly doc: DynamoDBDocumentClient,
    @Inject(DYNAMO_CONFIG) private readonly config: DynamoConfig,
  ) {}

  /** Adquire ou renova o lease. `false` = outra réplica é a dona e o lease dela vale. */
  async adquirir(agora = Date.now()): Promise<boolean> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.config.tabela,
          Key: chaves.lockOutbox,
          UpdateExpression: 'SET dono = :dono, leaseAte = :ate',
          ConditionExpression: 'attribute_not_exists(dono) OR dono = :dono OR leaseAte < :agora',
          ExpressionAttributeValues: { ':dono': this.dono, ':ate': agora + DURACAO_LEASE_MS, ':agora': agora },
        }),
      );
      return true;
    } catch (erro) {
      if (erro instanceof ConditionalCheckFailedException) return false;
      throw erro;
    }
  }

  async liberar(): Promise<void> {
    try {
      await this.doc.send(
        new DeleteCommand({
          TableName: this.config.tabela,
          Key: chaves.lockOutbox,
          ConditionExpression: 'dono = :dono',
          ExpressionAttributeValues: { ':dono': this.dono },
        }),
      );
    } catch (erro) {
      if (!(erro instanceof ConditionalCheckFailedException)) throw erro;
    }
  }
}

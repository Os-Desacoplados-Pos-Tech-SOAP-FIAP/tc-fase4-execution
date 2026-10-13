import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';

import { IMetricasExecucao, TempoMedioPorServico } from '../../application/ports/metricas';
import { chaves } from '../dynamo/chaves';
import { DYNAMO_CONFIG, DynamoConfig } from '../dynamo/dynamo.config';
import { DynamoUnitOfWork } from '../dynamo/dynamo-unit-of-work';

interface Acumulado {
  SK: string;
  nome?: string;
  totalMinutos?: number;
  quantidade?: number;
}

const media = (a: Acumulado) =>
  a.quantidade ? Math.round((a.totalMinutos ?? 0) / a.quantidade) : 0;

/** Médias O(1): contadores atualizados na mesma transação do apontamento. */
@Injectable()
export class DynamoMetricas implements IMetricasExecucao {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly uow: DynamoUnitOfWork,
    @Inject(DYNAMO_CONFIG) private readonly config: DynamoConfig,
  ) {}

  registrarServicoExecutado(servicoId: string, nome: string, minutos: number): Promise<void> {
    this.uow.adicionar({
      Update: {
        TableName: this.config.tabela,
        Key: chaves.metricaServico(servicoId),
        UpdateExpression: 'SET nome = :nome ADD totalMinutos :minutos, quantidade :um',
        ExpressionAttributeValues: { ':nome': nome, ':minutos': minutos, ':um': 1 },
      },
    });
    return Promise.resolve();
  }

  registrarExecucaoConcluida(minutos: number): Promise<void> {
    this.uow.adicionar({
      Update: {
        TableName: this.config.tabela,
        Key: chaves.metricaExecucao,
        UpdateExpression: 'ADD totalMinutos :minutos, quantidade :um',
        ExpressionAttributeValues: { ':minutos': minutos, ':um': 1 },
      },
    });
    return Promise.resolve();
  }

  async tempoMedioExecucao(): Promise<number> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.config.tabela, Key: chaves.metricaExecucao }),
    );
    return Item ? media(Item as Acumulado) : 0;
  }

  async tempoMedioPorServico(): Promise<TempoMedioPorServico[]> {
    const { Items } = await this.doc.send(
      new QueryCommand({
        TableName: this.config.tabela,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :servico)',
        ExpressionAttributeValues: { ':pk': 'METRICA', ':servico': 'SERVICO#' },
      }),
    );
    return ((Items ?? []) as Acumulado[]).map((a) => ({
      servicoId: a.SK.replace('SERVICO#', ''),
      nome: a.nome ?? '',
      tempoMedioMinutos: media(a),
      totalExecucoes: a.quantidade ?? 0,
    }));
  }
}

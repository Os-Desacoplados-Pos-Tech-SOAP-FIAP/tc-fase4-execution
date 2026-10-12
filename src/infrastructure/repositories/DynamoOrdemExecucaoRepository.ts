import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';

import {
  ItemExecucao,
  OrdemExecucao,
  TransicaoExecucao,
} from '../../domain/execucao/entities/OrdemExecucao';
import { IOrdemExecucaoRepository } from '../../domain/execucao/repositories/IOrdemExecucaoRepository';
import { StatusExecucao } from '../../domain/execucao/value-objects/StatusExecucao';
import { UniqueID } from '../../domain/shared/UniqueID';
import { chaves } from '../dynamo/chaves';
import { DYNAMO_CONFIG, DynamoConfig } from '../dynamo/dynamo.config';
import { DynamoUnitOfWork } from '../dynamo/dynamo-unit-of-work';

interface ItemExecucaoGravado {
  itemId: string;
  servicoId: string;
  descricao: string;
  inicio?: string;
  fim?: string;
}

interface OrdemGravada {
  id: string;
  osId: string;
  numeroOs?: number;
  status: StatusExecucao;
  mecanicoId?: string;
  itens: ItemExecucaoGravado[];
  enfileiradoEm: string;
  reparoIniciadoEm?: string;
  concluidoEm?: string;
  versao: number;
  criadoEm: string;
  atualizadoEm: string;
}

interface TransicaoGravada {
  de: StatusExecucao | null;
  para: StatusExecucao;
  em: string;
  detalhe?: string;
}

const data = (iso?: string) => (iso ? new Date(iso) : undefined);

@Injectable()
export class DynamoOrdemExecucaoRepository implements IOrdemExecucaoRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly uow: DynamoUnitOfWork,
    @Inject(DYNAMO_CONFIG) private readonly config: DynamoConfig,
  ) {}

  async buscarPorOs(osId: string): Promise<OrdemExecucao | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.config.tabela, Key: chaves.ordem(osId), ConsistentRead: true }),
    );
    if (!Item) return null;
    const ordem = this.toDomain(Item as OrdemGravada);
    this.registrarVersaoSeEmTransacao(osId, ordem.versao);
    return ordem;
  }

  async salvar(ordem: OrdemExecucao): Promise<void> {
    const transicoes = ordem.pullTransicoes();
    const esperada = ordem.versao;
    const nova = ordem.avancarVersao();

    this.uow.adicionar({
      Put: {
        TableName: this.config.tabela,
        Item: {
          ...chaves.ordem(ordem.osId),
          ...chaves.fila(ordem.status, ordem.enfileiradoEm, ordem.osId),
          ...this.toItem(ordem),
        },
        ...(esperada === 0
          ? { ConditionExpression: 'attribute_not_exists(PK)' }
          : {
              ConditionExpression: 'versao = :esperada',
              ExpressionAttributeValues: { ':esperada': esperada },
            }),
      },
    });
    transicoes.forEach((transicao, indice) =>
      this.uow.adicionar({
        Put: {
          TableName: this.config.tabela,
          Item: {
            ...chaves.historico(ordem.osId, transicao.em, nova, indice),
            de: transicao.de,
            para: transicao.para,
            em: transicao.em.toISOString(),
            detalhe: transicao.detalhe,
          },
        },
      }),
    );
    this.uow.registrarVersao(ordem.osId, nova);
  }

  async listarPorStatus(status: readonly StatusExecucao[]): Promise<OrdemExecucao[]> {
    const listas = await Promise.all(status.map((s) => this.consultarFila(s)));
    return listas
      .flat()
      .sort((a, b) => a.enfileiradoEm.getTime() - b.enfileiradoEm.getTime());
  }

  async historico(osId: string): Promise<TransicaoExecucao[]> {
    const itens = await this.consultarTudo({
      TableName: this.config.tabela,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :hist)',
      ExpressionAttributeValues: { ':pk': `OS#${osId}`, ':hist': 'HIST#' },
    });
    return (itens as unknown as TransicaoGravada[]).map((t) => ({
      de: t.de,
      para: t.para,
      em: new Date(t.em),
      ...(t.detalhe ? { detalhe: t.detalhe } : {}),
    }));
  }

  private async consultarFila(status: StatusExecucao): Promise<OrdemExecucao[]> {
    const itens = await this.consultarTudo({
      TableName: this.config.tabela,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :fila',
      ExpressionAttributeValues: { ':fila': `FILA#${status}` },
    });
    return (itens as unknown as OrdemGravada[]).map((item) => this.toDomain(item));
  }

  private async consultarTudo(
    entrada: ConstructorParameters<typeof QueryCommand>[0],
  ): Promise<Record<string, unknown>[]> {
    const itens: Record<string, unknown>[] = [];
    let inicio: Record<string, unknown> | undefined;
    do {
      const pagina = await this.doc.send(new QueryCommand({ ...entrada, ExclusiveStartKey: inicio }));
      itens.push(...(pagina.Items ?? []));
      inicio = pagina.LastEvaluatedKey;
    } while (inicio);
    return itens;
  }

  private registrarVersaoSeEmTransacao(osId: string, versao: number): void {
    try {
      this.uow.registrarVersao(osId, versao);
    } catch {
      // leitura fora de transação (consultas): não há outbox a ordenar
    }
  }

  private toItem(ordem: OrdemExecucao): OrdemGravada {
    return {
      id: ordem.id.toValue(),
      osId: ordem.osId,
      numeroOs: ordem.numeroOs,
      status: ordem.status,
      mecanicoId: ordem.mecanicoId,
      itens: ordem.itens.map((item: ItemExecucao) => ({
        itemId: item.itemId,
        servicoId: item.servicoId,
        descricao: item.descricao,
        inicio: item.inicio?.toISOString(),
        fim: item.fim?.toISOString(),
      })),
      enfileiradoEm: ordem.enfileiradoEm.toISOString(),
      reparoIniciadoEm: ordem.reparoIniciadoEm?.toISOString(),
      concluidoEm: ordem.concluidoEm?.toISOString(),
      versao: ordem.versao,
      criadoEm: ordem.criadoEm.toISOString(),
      atualizadoEm: ordem.atualizadoEm.toISOString(),
    };
  }

  private toDomain(item: OrdemGravada): OrdemExecucao {
    return OrdemExecucao.restaurar(
      {
        osId: item.osId,
        numeroOs: item.numeroOs,
        status: item.status,
        mecanicoId: item.mecanicoId,
        itens: item.itens.map((i) => ({
          itemId: i.itemId,
          servicoId: i.servicoId,
          descricao: i.descricao,
          ...(i.inicio ? { inicio: new Date(i.inicio) } : {}),
          ...(i.fim ? { fim: new Date(i.fim) } : {}),
        })),
        enfileiradoEm: new Date(item.enfileiradoEm),
        reparoIniciadoEm: data(item.reparoIniciadoEm),
        concluidoEm: data(item.concluidoEm),
        versao: item.versao,
        criadoEm: new Date(item.criadoEm),
        atualizadoEm: new Date(item.atualizadoEm),
      },
      new UniqueID(item.id),
    );
  }
}

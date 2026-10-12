import { performance } from 'node:perf_hooks';

import { DeleteCommand, DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';

import { MessageEnvelope } from '../../application/ports/message-envelope';
import { DYNAMO_CONFIG, DynamoConfig } from '../dynamo/dynamo.config';
import { erroParaLog } from './erro-para-log';
import { MESSAGING_CONFIG, MessagingConfig } from './messaging.config';
import { OutboxLease } from './outbox-lease';
import { SnsSqsTransport } from './sns-sqs.transport';

const INTERVALO_MS = 1000;
const PRAZO_NOVOS_ENVIOS_MS = 5_000;
const MAXIMO_ITENS_POR_CICLO = 500;
const TAMANHO_MAXIMO_ERRO = 500;

interface ItemOutbox {
  PK: string;
  SK: string;
  groupId: string;
  type: string;
  destination: string;
  body: MessageEnvelope;
  traceparent?: string;
  tentativas: number;
}

/**
 * Publica a outbox do DynamoDB. Um único publicador (lease); dentro de cada OS, em ordem
 * de SK; falha bloqueia só a OS da mensagem; OS sem falha anterior saem primeiro.
 */
@Injectable()
export class OutboxPublisher implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(OutboxPublisher.name);
  private timer?: NodeJS.Timeout;
  private cicloAtual?: Promise<void>;

  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly transporte: SnsSqsTransport,
    private readonly lease: OutboxLease,
    @Inject(DYNAMO_CONFIG) private readonly dynamo: DynamoConfig,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(() => void this.ciclo(), INTERVALO_MS);
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.cicloAtual;
    if (this.config.enabled) await this.lease.liberar();
  }

  private ciclo(): Promise<void> {
    this.cicloAtual ??= this.publicarComLog().finally(() => (this.cicloAtual = undefined));
    return this.cicloAtual;
  }

  private async publicarComLog(): Promise<void> {
    try {
      await this.publicarPendentes();
    } catch (erro) {
      this.logger.error({ msg: 'Falha ao publicar a outbox', err: erroParaLog(erro) });
    }
  }

  async publicarPendentes(): Promise<number> {
    if (!(await this.lease.adquirir())) return 0;

    const inicio = performance.now();
    let total = 0;
    for (const grupo of this.ordenarGrupos(await this.pendentes())) {
      for (const item of grupo) {
        if (performance.now() - inicio > PRAZO_NOVOS_ENVIOS_MS) return total;
        if (!(await this.enviar(item))) break; // falhou: o resto desta OS espera
        total += 1;
      }
    }
    return total;
  }

  private async pendentes(): Promise<ItemOutbox[]> {
    const itens: ItemOutbox[] = [];
    let inicio: Record<string, unknown> | undefined;
    do {
      const pagina = await this.doc.send(
        new QueryCommand({
          TableName: this.dynamo.tabela,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': 'OUTBOX' },
          ExclusiveStartKey: inicio,
        }),
      );
      itens.push(...((pagina.Items ?? []) as ItemOutbox[]));
      inicio = pagina.LastEvaluatedKey;
    } while (inicio && itens.length < MAXIMO_ITENS_POR_CICLO);
    return itens;
  }

  /** Agrupa por OS (a SK já vem ordenada) e põe antes as OS cuja cabeça nunca falhou. */
  private ordenarGrupos(itens: ItemOutbox[]): ItemOutbox[][] {
    const grupos = new Map<string, ItemOutbox[]>();
    for (const item of itens) {
      grupos.set(item.groupId, [...(grupos.get(item.groupId) ?? []), item]);
    }
    return [...grupos.values()].sort(
      (a, b) => Number(a[0].tentativas > 0) - Number(b[0].tentativas > 0),
    );
  }

  private async enviar(item: ItemOutbox): Promise<boolean> {
    try {
      await this.transporte.enviar(item.destination, item.body, item.traceparent ?? null);
    } catch (erro) {
      this.logger.error({
        msg: 'Falha ao publicar mensagem da outbox',
        messageId: item.body.messageId,
        type: item.type,
        osId: item.groupId,
        err: erroParaLog(erro),
      });
      await this.doc.send(
        new UpdateCommand({
          TableName: this.dynamo.tabela,
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: 'ADD tentativas :um SET ultimoErro = :erro',
          ExpressionAttributeValues: {
            ':um': 1,
            ':erro': (erro as Error).message.slice(0, TAMANHO_MAXIMO_ERRO),
          },
        }),
      );
      return false;
    }
    await this.doc.send(
      new DeleteCommand({ TableName: this.dynamo.tabela, Key: { PK: item.PK, SK: item.SK } }),
    );
    return true;
  }
}

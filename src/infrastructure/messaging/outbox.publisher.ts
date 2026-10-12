import { performance } from 'node:perf_hooks';

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
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
import { DURACAO_LEASE_MS, OutboxLease } from './outbox-lease';
import { SnsSqsTransport } from './sns-sqs.transport';

const INTERVALO_MS = 1000;
const PRAZO_NOVOS_ENVIOS_MS = 5_000;
/**
 * Pior caso de um item depois de iniciado o envio, com os clientes atuais:
 * envio SNS/SQS 2 × (2s + 3s) = 10s + Update/Delete no Dynamo 3 × (2s + 3s) = 15s
 * + recuos entre tentativas do SDK (< 1s) = 26s. Só se inicia um envio até
 * DURACAO_LEASE_MS - margem (30s - 26s = 4s) após o início do ciclo, então o último
 * item termina antes de o lease expirar.
 */
export const MARGEM_SEGURANCA_LEASE_MS = 26_000;
/**
 * Limita a leitura de cada ciclo. Limitação conhecida: se houver 500+ itens bloqueados
 * (falhando) em OS de id lexicograficamente menor, os seguintes não são lidos (inanição).
 * Improvável com ids UUID e poucos eventos por OS.
 */
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

  /**
   * Novos envios só começam enquanto o ciclo está dentro dos dois prazos, contados do
   * mesmo início (antes de adquirir o lease, cuja validade parte desse instante):
   * PRAZO_NOVOS_ENVIOS_MS e DURACAO_LEASE_MS - MARGEM_SEGURANCA_LEASE_MS. Vale o menor;
   * com os clientes atuais é o do lease (4s). O que sobrar fica para o próximo ciclo.
   */
  async publicarPendentes(): Promise<number> {
    const inicio = performance.now();
    if (!(await this.lease.adquirir())) return 0;

    const prazo = Math.min(PRAZO_NOVOS_ENVIOS_MS, DURACAO_LEASE_MS - MARGEM_SEGURANCA_LEASE_MS);
    let total = 0;
    for (const grupo of this.ordenarGrupos(await this.pendentes())) {
      for (const item of grupo) {
        if (performance.now() - inicio > prazo) return total;
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
          ConsistentRead: true,
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
      const grupo = grupos.get(item.groupId);
      if (grupo) grupo.push(item);
      else grupos.set(item.groupId, [item]);
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
      await this.ignorarSeJaApagado(
        new UpdateCommand({
          TableName: this.dynamo.tabela,
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: 'ADD tentativas :um SET ultimoErro = :erro',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: {
            ':um': 1,
            ':erro': erroParaLog(erro).message.slice(0, TAMANHO_MAXIMO_ERRO),
          },
        }),
      );
      return false;
    }
    await this.ignorarSeJaApagado(
      new DeleteCommand({
        TableName: this.dynamo.tabela,
        Key: { PK: item.PK, SK: item.SK },
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
    return true;
  }

  /**
   * Item sumido = outro ciclo/réplica já o publicou e apagou. Sem a condição, o Update
   * recriaria um item só com chave e contadores, que travaria a outbox.
   */
  private async ignorarSeJaApagado(comando: UpdateCommand | DeleteCommand): Promise<void> {
    try {
      await this.doc.send(comando);
    } catch (erro) {
      if (!(erro instanceof ConditionalCheckFailedException)) throw erro;
    }
  }
}

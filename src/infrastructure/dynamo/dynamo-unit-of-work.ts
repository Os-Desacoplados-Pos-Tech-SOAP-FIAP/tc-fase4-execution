import { AsyncLocalStorage } from 'node:async_hooks';

import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { Injectable } from '@nestjs/common';

import { ITransactionManager } from '../../application/ports/transaction-manager';
import { ConcorrenciaError } from './concorrencia.error';

export type OperacaoDynamo = NonNullable<TransactWriteCommandInput['TransactItems']>[number];
export type ErroSeCondicaoFalhar = () => Error;

const LIMITE_TRANSACAO = 100;
/** Condição violada ou outra transação mexendo nos mesmos itens ao mesmo tempo. */
const CONFLITOS = new Set(['ConditionalCheckFailed', 'TransactionConflict']);

interface Contexto {
  operacoes: OperacaoDynamo[];
  /** Paralelo a `operacoes`: o índice do CancellationReasons aponta a operação que falhou. */
  errosSeCondicaoFalhar: (ErroSeCondicaoFalhar | undefined)[];
  versoes: Map<string, number>;
  indices: Map<string, number>;
}

/**
 * O DynamoDB não tem transação interativa: dentro de `run` as leituras vão direto à
 * tabela e as escritas são acumuladas; no fim, tudo sai num único TransactWriteItems
 * (atômico). Se o trabalho lança, nada é gravado.
 */
@Injectable()
export class DynamoUnitOfWork implements ITransactionManager {
  private readonly contexto = new AsyncLocalStorage<Contexto>();

  constructor(private readonly doc: DynamoDBDocumentClient) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.contexto.getStore()) return work();
    const contexto: Contexto = {
      operacoes: [],
      errosSeCondicaoFalhar: [],
      versoes: new Map(),
      indices: new Map(),
    };
    const resultado = await this.contexto.run(contexto, work);
    await this.confirmar(contexto);
    return resultado;
  }

  /**
   * `erroSeCondicaoFalhar` traduz a condição violada desta operação numa regra de negócio
   * (ex.: vaga tomada por outra réplica), em vez do ConcorrenciaError genérico.
   */
  adicionar(operacao: OperacaoDynamo, erroSeCondicaoFalhar?: ErroSeCondicaoFalhar): void {
    const contexto = this.atual();
    contexto.operacoes.push(operacao);
    contexto.errosSeCondicaoFalhar.push(erroSeCondicaoFalhar);
  }

  /** Versão da ordem gravada (ou lida) nesta transação, usada para ordenar a outbox. */
  registrarVersao(grupo: string, versao: number): void {
    this.atual().versoes.set(grupo, versao);
  }

  versaoDe(grupo: string): number {
    return this.atual().versoes.get(grupo) ?? 0;
  }

  proximoIndice(grupo: string): number {
    const indices = this.atual().indices;
    const indice = indices.get(grupo) ?? 0;
    indices.set(grupo, indice + 1);
    return indice;
  }

  private atual(): Contexto {
    const contexto = this.contexto.getStore();
    if (!contexto) {
      throw new Error('Escrita no DynamoDB fora de ITransactionManager.run');
    }
    return contexto;
  }

  private async confirmar({ operacoes, errosSeCondicaoFalhar }: Contexto): Promise<void> {
    if (operacoes.length === 0) return;
    if (operacoes.length > LIMITE_TRANSACAO) {
      throw new Error(`Transação com ${operacoes.length} escritas (limite ${LIMITE_TRANSACAO})`);
    }
    try {
      await this.doc.send(new TransactWriteCommand({ TransactItems: operacoes }));
    } catch (erro) {
      const motivos = erro instanceof TransactionCanceledException ? erro.CancellationReasons ?? [] : [];
      const fabricaDeErro = motivos
        .map((motivo, indice) =>
          motivo.Code === 'ConditionalCheckFailed' ? errosSeCondicaoFalhar[indice] : undefined,
        )
        .find((fabrica) => fabrica !== undefined);
      if (fabricaDeErro) throw fabricaDeErro();
      if (motivos.some((motivo) => CONFLITOS.has(motivo.Code ?? ''))) {
        throw new ConcorrenciaError('outra operação alterou os mesmos itens');
      }
      throw erro;
    }
  }
}

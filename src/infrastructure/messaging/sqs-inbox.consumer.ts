import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { performance } from 'node:perf_hooks';

import { MessageEnvelope } from '../../application/ports/message-envelope';
import { processarNoContexto } from '../telemetry/contexto-mensagem';
import { erroParaLog } from './erro-para-log';
import { lerEnvelope } from './message-envelope.parser';
import { MessageHandlerRegistry } from './message-handler.registry';
import { MESSAGING_CONFIG, MessagingConfig } from './messaging.config';

const PAUSA_APOS_ERRO_MS = 1000;

/**
 * Long-polling na fila FIFO de entrada. Mensagem processada é apagada; com falha,
 * fica na fila (volta após o visibility timeout e vai para a DLQ após 3 tentativas).
 * Depois de uma falha, as mensagens seguintes do mesmo grupo (OS) no lote são puladas
 * para não quebrar a ordem da saga.
 */
@Injectable()
export class SqsInboxConsumer implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(SqsInboxConsumer.name);
  private readonly encerramento = new AbortController();
  private ativo = false;
  private loop?: Promise<void>;

  constructor(
    private readonly sqs: SQSClient,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
    private readonly registry: MessageHandlerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    this.ativo = true;
    this.loop = this.consumirAteEncerrar();
  }

  /**
   * Roda antes de o banco/clientes encerrarem: interrompe o long-poll pendente (até 20s) e espera
   * o lote em processamento terminar.
   */
  async beforeApplicationShutdown(): Promise<void> {
    this.ativo = false;
    this.encerramento.abort();
    await this.loop;
  }

  private async consumirAteEncerrar(): Promise<void> {
    while (this.ativo) {
      try {
        await this.consumirLote();
      } catch (erro) {
        if (this.encerramento.signal.aborted) return; // receive abortado no shutdown, não é erro
        this.logger.error({ msg: 'Falha ao ler a fila de entrada', err: erroParaLog(erro) });
        await new Promise((resolve) => setTimeout(resolve, PAUSA_APOS_ERRO_MS));
      }
    }
  }

  async consumirLote(): Promise<void> {
    const resposta = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: this.config.inboxQueueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        MessageSystemAttributeNames: ['MessageGroupId'],
        MessageAttributeNames: ['All'],
      }),
      { abortSignal: this.encerramento.signal },
    );

    const gruposComFalha = new Set<string>();
    for (const mensagem of resposta.Messages ?? []) {
      const grupo = mensagem.Attributes?.MessageGroupId ?? '';
      if (gruposComFalha.has(grupo)) continue;
      if (!(await this.processar(mensagem))) gruposComFalha.add(grupo);
    }
  }

  /**
   * O envelope é lido antes de abrir o span, para identificar a mensagem nele; se a leitura
   * falhar, o erro é relançado dentro do span e segue o caminho de falha de sempre.
   */
  private async processar(mensagem: Message): Promise<boolean> {
    const inicio = performance.now();
    let envelope: MessageEnvelope | undefined;
    let erroLeitura: unknown;
    try {
      envelope = lerEnvelope(mensagem.Body);
    } catch (erro) {
      erroLeitura = erro;
    }
    const info = {
      type: envelope?.type,
      messageId: envelope?.messageId,
      osId: envelope?.correlationId ?? mensagem.Attributes?.MessageGroupId,
    };

    try {
      await processarNoContexto(mensagem.MessageAttributes, info, async () => {
        try {
          if (!envelope) throw erroLeitura;
          await this.registry.despachar(envelope);
          await this.sqs.send(
            new DeleteMessageCommand({
              QueueUrl: this.config.inboxQueueUrl,
              ReceiptHandle: mensagem.ReceiptHandle,
            }),
          );
        } catch (erro) {
          // Dentro do span: o log sai com o trace_id da mensagem.
          this.logger.error({
            msg: 'Falha ao processar mensagem',
            ...info,
            sqsMessageId: mensagem.MessageId,
            err: erroParaLog(erro),
          });
          throw erro;
        }
        this.logger.log({
          msg: 'Mensagem processada',
          ...info,
          duracaoMs: Math.round(performance.now() - inicio),
        });
      });
      return true;
    } catch {
      return false;
    }
  }
}

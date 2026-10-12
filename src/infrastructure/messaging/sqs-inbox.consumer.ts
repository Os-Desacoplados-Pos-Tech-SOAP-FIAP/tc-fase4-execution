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

import { MessageEnvelope } from '../../application/ports/message-envelope';
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
   * Roda antes do Prisma desconectar: interrompe o long-poll pendente (até 20s) e espera
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

  private async processar(mensagem: Message): Promise<boolean> {
    let envelope: MessageEnvelope | undefined;
    try {
      envelope = lerEnvelope(mensagem.Body);
      await this.registry.despachar(envelope);
      await this.sqs.send(
        new DeleteMessageCommand({
          QueueUrl: this.config.inboxQueueUrl,
          ReceiptHandle: mensagem.ReceiptHandle,
        }),
      );
      return true;
    } catch (erro) {
      this.logger.error({
        msg: 'Falha ao processar mensagem',
        messageId: envelope?.messageId,
        type: envelope?.type,
        osId: envelope?.correlationId ?? mensagem.Attributes?.MessageGroupId,
        sqsMessageId: mensagem.MessageId,
        err: erroParaLog(erro),
      });
      return false;
    }
  }
}

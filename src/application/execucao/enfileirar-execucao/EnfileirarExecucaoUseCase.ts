import { Inject, Injectable } from '@nestjs/common';

import { ConfigExecucao, INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { IOrdemExecucaoRepository } from '../../../domain/execucao/repositories/IOrdemExecucaoRepository';
import { StatusExecucao } from '../../../domain/execucao/value-objects/StatusExecucao';
import { DomainError } from '../../../domain/shared/DomainError';
import { ICapacidadeExecucao } from '../../ports/capacidade';
import { ContextoMensagem, criarEnvelope } from '../../ports/message-envelope';
import { IOutbox } from '../../ports/outbox';
import { IProcessedMessageRepository } from '../../ports/processed-message.repository';
import { IRelogio } from '../../ports/relogio';
import { ITransactionManager } from '../../ports/transaction-manager';
import {
  EXECUTION_EVENTS,
  ExecucaoRecusadaPayload,
  ItemExecucaoPayload,
  MOTIVOS_RECUSA,
  OsPayload,
} from '../execution-messages';

const JA_ACEITA: readonly StatusExecucao[] = [
  StatusExecucao.AGUARDANDO_REPARO,
  StatusExecucao.EM_REPARO,
  StatusExecucao.CONCLUIDA,
];

function ehMotivoDeRecusa(erro: unknown): erro is DomainError {
  return erro instanceof DomainError && (MOTIVOS_RECUSA as readonly string[]).includes(erro.code);
}

export interface EnfileirarExecucaoInput extends ContextoMensagem {
  itens: ItemExecucaoPayload[];
}

/**
 * Transação pivô da saga. Só os motivos do contrato (MOTIVOS_RECUSA: capacidade — inclusive
 * a vaga tomada por outra réplica no commit —, OS desconhecida ou fora de estado) viram
 * execucao-recusada numa segunda transação e a saga compensa; qualquer outro erro propaga
 * para a mensagem ser retentada ou ir para a DLQ.
 */
@Injectable()
export class EnfileirarExecucaoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.PROCESSED_MESSAGE_REPOSITORY)
    private readonly mensagensProcessadas: IProcessedMessageRepository,
    @Inject(INJECTION_TOKENS.ORDEM_EXECUCAO_REPOSITORY)
    private readonly ordens: IOrdemExecucaoRepository,
    @Inject(INJECTION_TOKENS.CAPACIDADE_EXECUCAO)
    private readonly capacidade: ICapacidadeExecucao,
    @Inject(INJECTION_TOKENS.OUTBOX) private readonly outbox: IOutbox,
    @Inject(INJECTION_TOKENS.RELOGIO) private readonly relogio: IRelogio,
    @Inject(INJECTION_TOKENS.CONFIG_EXECUCAO) private readonly config: ConfigExecucao,
  ) {}

  async execute(input: EnfileirarExecucaoInput): Promise<void> {
    try {
      await this.transacao.run(() => this.aceitar(input));
    } catch (erro) {
      if (!ehMotivoDeRecusa(erro)) throw erro;
      await this.transacao.run(() => this.recusar(input, erro));
    }
  }

  private async aceitar(input: EnfileirarExecucaoInput): Promise<void> {
    if (!(await this.mensagensProcessadas.registrar(input.messageId))) return;

    const ordem = await this.ordens.buscarPorOs(input.correlationId);
    if (!ordem) {
      throw new DomainError(
        `Ordem de execução da OS ${input.correlationId} não encontrada`,
        'ORDEM_NAO_ENCONTRADA',
      );
    }
    if (!JA_ACEITA.includes(ordem.status)) {
      if (ordem.status !== StatusExecucao.DIAGNOSTICO_CONCLUIDO) {
        throw new DomainError(
          `Ordem da OS ${input.correlationId} está em ${ordem.status}`,
          'ORDEM_EM_ESTADO_INVALIDO',
        );
      }
      if ((await this.capacidade.ativos()) >= this.config.capacidadeMaxima) {
        throw new DomainError('Capacidade de execução esgotada', 'CAPACIDADE_ESGOTADA');
      }
      ordem.aceitarExecucao(input.itens, this.relogio.agora());
      await this.ordens.salvar(ordem);
      await this.capacidade.ocupar(this.config.capacidadeMaxima);
    }

    await this.publicarAceite(input);
  }

  private async publicarAceite(input: EnfileirarExecucaoInput): Promise<void> {
    await this.outbox.publicar(
      criarEnvelope<OsPayload>(
        EXECUTION_EVENTS.EXECUCAO_ACEITA,
        input.correlationId,
        { osId: input.correlationId },
        input.messageId,
      ),
    );
  }

  private async recusar(input: EnfileirarExecucaoInput, erro: DomainError): Promise<void> {
    if (!(await this.mensagensProcessadas.registrar(input.messageId))) return;

    const ordem = await this.ordens.buscarPorOs(input.correlationId);
    // Outra entrega aceitou a OS entre as duas transações: depois do pivô não há recusa.
    if (ordem && JA_ACEITA.includes(ordem.status)) {
      await this.publicarAceite(input);
      return;
    }
    if (ordem?.status === StatusExecucao.DIAGNOSTICO_CONCLUIDO) {
      ordem.recusarExecucao(erro.code, this.relogio.agora());
      await this.ordens.salvar(ordem);
    }
    await this.outbox.publicar(
      criarEnvelope<ExecucaoRecusadaPayload>(
        EXECUTION_EVENTS.EXECUCAO_RECUSADA,
        input.correlationId,
        { osId: input.correlationId, motivo: erro.code, mensagem: erro.message },
        input.messageId,
      ),
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { IOrdemExecucaoRepository } from '../../../domain/execucao/repositories/IOrdemExecucaoRepository';
import { StatusExecucao } from '../../../domain/execucao/value-objects/StatusExecucao';
import { DomainError } from '../../../domain/shared/DomainError';
import { ContextoMensagem, criarEnvelope } from '../../ports/message-envelope';
import { IOutbox } from '../../ports/outbox';
import { IProcessedMessageRepository } from '../../ports/processed-message.repository';
import { IRelogio } from '../../ports/relogio';
import { ITransactionManager } from '../../ports/transaction-manager';
import { DiagnosticoIniciadoPayload, EXECUTION_EVENTS } from '../execution-messages';

const MOTIVO = 'diagnóstico concluído sem itens; reaberto pelo orquestrador';

@Injectable()
export class ReabrirDiagnosticoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.PROCESSED_MESSAGE_REPOSITORY)
    private readonly mensagensProcessadas: IProcessedMessageRepository,
    @Inject(INJECTION_TOKENS.ORDEM_EXECUCAO_REPOSITORY)
    private readonly ordens: IOrdemExecucaoRepository,
    @Inject(INJECTION_TOKENS.OUTBOX) private readonly outbox: IOutbox,
    @Inject(INJECTION_TOKENS.RELOGIO) private readonly relogio: IRelogio,
  ) {}

  async execute(input: ContextoMensagem): Promise<void> {
    await this.transacao.run(async () => {
      if (!(await this.mensagensProcessadas.registrar(input.messageId))) return;
      const ordem = await this.ordens.buscarPorOs(input.correlationId);
      if (!ordem) {
        throw new DomainError(
          `Ordem de execução da OS ${input.correlationId} não encontrada`,
          'ORDEM_NAO_ENCONTRADA',
        );
      }
      if (ordem.status === StatusExecucao.EM_DIAGNOSTICO) return;

      ordem.reabrirDiagnostico(this.relogio.agora(), MOTIVO);
      await this.ordens.salvar(ordem);
      await this.outbox.publicar(
        criarEnvelope<DiagnosticoIniciadoPayload>(
          EXECUTION_EVENTS.DIAGNOSTICO_INICIADO,
          input.correlationId,
          { osId: input.correlationId, mecanicoId: ordem.mecanicoId as string },
          input.messageId,
        ),
      );
    });
  }
}

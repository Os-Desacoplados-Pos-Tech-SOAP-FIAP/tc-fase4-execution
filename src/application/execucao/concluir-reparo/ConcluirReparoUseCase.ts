import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { OrdemExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { IOrdemExecucaoRepository } from '../../../domain/execucao/repositories/IOrdemExecucaoRepository';
import { ICapacidadeExecucao } from '../../ports/capacidade';
import { criarEnvelope } from '../../ports/message-envelope';
import { IMetricasExecucao } from '../../ports/metricas';
import { IOutbox } from '../../ports/outbox';
import { IRelogio } from '../../ports/relogio';
import { ITransactionManager } from '../../ports/transaction-manager';
import { buscarOrdem } from '../buscar-ordem';
import { EXECUTION_EVENTS, ExecucaoConcluidaPayload } from '../execution-messages';

@Injectable()
export class ConcluirReparoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.ORDEM_EXECUCAO_REPOSITORY)
    private readonly ordens: IOrdemExecucaoRepository,
    @Inject(INJECTION_TOKENS.CAPACIDADE_EXECUCAO)
    private readonly capacidade: ICapacidadeExecucao,
    @Inject(INJECTION_TOKENS.METRICAS_EXECUCAO) private readonly metricas: IMetricasExecucao,
    @Inject(INJECTION_TOKENS.OUTBOX) private readonly outbox: IOutbox,
    @Inject(INJECTION_TOKENS.RELOGIO) private readonly relogio: IRelogio,
  ) {}

  execute(osId: string): Promise<OrdemExecucao> {
    return this.transacao.run(async () => {
      const ordem = await buscarOrdem(this.ordens, osId);
      const minutos = ordem.concluirReparo(this.relogio.agora());
      await this.ordens.salvar(ordem);
      await this.capacidade.liberar();
      await this.metricas.registrarExecucaoConcluida(minutos);
      await this.outbox.publicar(
        criarEnvelope<ExecucaoConcluidaPayload>(EXECUTION_EVENTS.EXECUCAO_CONCLUIDA, osId, {
          osId,
          minutos,
        }),
      );
      return ordem;
    });
  }
}

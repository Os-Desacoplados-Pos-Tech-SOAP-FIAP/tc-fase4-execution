import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { OrdemExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { IOrdemExecucaoRepository } from '../../../domain/execucao/repositories/IOrdemExecucaoRepository';
import { criarEnvelope } from '../../ports/message-envelope';
import { IMetricasExecucao } from '../../ports/metricas';
import { IOutbox } from '../../ports/outbox';
import { IRelogio } from '../../ports/relogio';
import { ITransactionManager } from '../../ports/transaction-manager';
import { buscarOrdem } from '../buscar-ordem';
import { EXECUTION_EVENTS, ServicoExecutadoPayload } from '../execution-messages';

export type AcaoApontamento = 'INICIAR' | 'FINALIZAR';

@Injectable()
export class ApontarServicoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.ORDEM_EXECUCAO_REPOSITORY)
    private readonly ordens: IOrdemExecucaoRepository,
    @Inject(INJECTION_TOKENS.METRICAS_EXECUCAO) private readonly metricas: IMetricasExecucao,
    @Inject(INJECTION_TOKENS.OUTBOX) private readonly outbox: IOutbox,
    @Inject(INJECTION_TOKENS.RELOGIO) private readonly relogio: IRelogio,
  ) {}

  execute(osId: string, itemId: string, acao: AcaoApontamento): Promise<OrdemExecucao> {
    return this.transacao.run(async () => {
      const ordem = await buscarOrdem(this.ordens, osId);
      if (acao === 'INICIAR') {
        ordem.iniciarServico(itemId, this.relogio.agora());
        await this.ordens.salvar(ordem);
        return ordem;
      }

      const minutos = ordem.finalizarServico(itemId, this.relogio.agora());
      const item = ordem.itens.find((x) => x.itemId === itemId)!;
      await this.ordens.salvar(ordem);
      await this.metricas.registrarServicoExecutado(item.servicoId, item.descricao, minutos);
      await this.outbox.publicar(
        criarEnvelope<ServicoExecutadoPayload>(EXECUTION_EVENTS.SERVICO_EXECUTADO, osId, {
          osId,
          itemId,
          servicoId: item.servicoId,
          minutos,
        }),
      );
      return ordem;
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { OrdemExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { IOrdemExecucaoRepository } from '../../../domain/execucao/repositories/IOrdemExecucaoRepository';
import { criarEnvelope } from '../../ports/message-envelope';
import { IOutbox } from '../../ports/outbox';
import { IRelogio } from '../../ports/relogio';
import { ITransactionManager } from '../../ports/transaction-manager';
import { buscarOrdem } from '../buscar-ordem';
import { EXECUTION_EVENTS, OsPayload } from '../execution-messages';

@Injectable()
export class ConcluirDiagnosticoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.ORDEM_EXECUCAO_REPOSITORY)
    private readonly ordens: IOrdemExecucaoRepository,
    @Inject(INJECTION_TOKENS.OUTBOX) private readonly outbox: IOutbox,
    @Inject(INJECTION_TOKENS.RELOGIO) private readonly relogio: IRelogio,
  ) {}

  execute(osId: string): Promise<OrdemExecucao> {
    return this.transacao.run(async () => {
      const ordem = await buscarOrdem(this.ordens, osId);
      ordem.concluirDiagnostico(this.relogio.agora());
      await this.ordens.salvar(ordem);
      await this.outbox.publicar(
        criarEnvelope<OsPayload>(EXECUTION_EVENTS.DIAGNOSTICO_CONCLUIDO, osId, { osId }),
      );
      return ordem;
    });
  }
}

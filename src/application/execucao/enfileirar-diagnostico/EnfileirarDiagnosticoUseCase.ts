import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { OrdemExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { IOrdemExecucaoRepository } from '../../../domain/execucao/repositories/IOrdemExecucaoRepository';
import { ContextoMensagem } from '../../ports/message-envelope';
import { IProcessedMessageRepository } from '../../ports/processed-message.repository';
import { IRelogio } from '../../ports/relogio';
import { ITransactionManager } from '../../ports/transaction-manager';

export interface EnfileirarDiagnosticoInput extends ContextoMensagem {
  numeroOs?: number;
}

@Injectable()
export class EnfileirarDiagnosticoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.PROCESSED_MESSAGE_REPOSITORY)
    private readonly mensagensProcessadas: IProcessedMessageRepository,
    @Inject(INJECTION_TOKENS.ORDEM_EXECUCAO_REPOSITORY)
    private readonly ordens: IOrdemExecucaoRepository,
    @Inject(INJECTION_TOKENS.RELOGIO) private readonly relogio: IRelogio,
  ) {}

  async execute(input: EnfileirarDiagnosticoInput): Promise<void> {
    await this.transacao.run(async () => {
      if (!(await this.mensagensProcessadas.registrar(input.messageId))) return;
      if (await this.ordens.buscarPorOs(input.correlationId)) return;
      await this.ordens.salvar(
        OrdemExecucao.enfileirarDiagnostico(input.correlationId, this.relogio.agora(), input.numeroOs),
      );
    });
  }
}

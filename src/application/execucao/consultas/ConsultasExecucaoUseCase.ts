import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { OrdemExecucao, TransicaoExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { IOrdemExecucaoRepository } from '../../../domain/execucao/repositories/IOrdemExecucaoRepository';
import {
  STATUS_NA_FILA,
  StatusExecucao,
} from '../../../domain/execucao/value-objects/StatusExecucao';
import { IMetricasExecucao, TempoMedioPorServico } from '../../ports/metricas';
import { buscarOrdem } from '../buscar-ordem';

@Injectable()
export class ConsultasExecucaoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.ORDEM_EXECUCAO_REPOSITORY)
    private readonly ordens: IOrdemExecucaoRepository,
    @Inject(INJECTION_TOKENS.METRICAS_EXECUCAO) private readonly metricas: IMetricasExecucao,
  ) {}

  fila(status?: StatusExecucao): Promise<OrdemExecucao[]> {
    return this.ordens.listarPorStatus(status ? [status] : STATUS_NA_FILA);
  }

  async detalhe(osId: string): Promise<{ ordem: OrdemExecucao; historico: TransicaoExecucao[] }> {
    const ordem = await buscarOrdem(this.ordens, osId);
    return { ordem, historico: await this.ordens.historico(osId) };
  }

  async tempoMedio(): Promise<{ tempoMedioMinutos: number }> {
    return { tempoMedioMinutos: await this.metricas.tempoMedioExecucao() };
  }

  tempoMedioPorServico(): Promise<TempoMedioPorServico[]> {
    return this.metricas.tempoMedioPorServico();
  }
}

export interface TempoMedioPorServico {
  servicoId: string;
  nome: string;
  tempoMedioMinutos: number;
  totalExecucoes: number;
}

/** Contadores agregados de tempo, atualizados na mesma transação do apontamento. */
export interface IMetricasExecucao {
  registrarServicoExecutado(servicoId: string, nome: string, minutos: number): Promise<void>;
  registrarExecucaoConcluida(minutos: number): Promise<void>;
  tempoMedioExecucao(): Promise<number>;
  tempoMedioPorServico(): Promise<TempoMedioPorServico[]>;
}

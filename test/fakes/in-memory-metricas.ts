import { IMetricasExecucao, TempoMedioPorServico } from '../../src/application/ports/metricas';
import { ParticipanteTransacao } from './fake-transaction.manager';

interface Acumulado {
  nome: string;
  totalMinutos: number;
  quantidade: number;
}

export class InMemoryMetricas implements IMetricasExecucao, ParticipanteTransacao {
  public servicos = new Map<string, Acumulado>();
  public execucao = { totalMinutos: 0, quantidade: 0 };

  async registrarServicoExecutado(servicoId: string, nome: string, minutos: number): Promise<void> {
    const atual = this.servicos.get(servicoId) ?? { nome, totalMinutos: 0, quantidade: 0 };
    this.servicos.set(servicoId, {
      nome,
      totalMinutos: atual.totalMinutos + minutos,
      quantidade: atual.quantidade + 1,
    });
  }
  async registrarExecucaoConcluida(minutos: number): Promise<void> {
    this.execucao = {
      totalMinutos: this.execucao.totalMinutos + minutos,
      quantidade: this.execucao.quantidade + 1,
    };
  }
  async tempoMedioExecucao(): Promise<number> {
    const { totalMinutos, quantidade } = this.execucao;
    return quantidade === 0 ? 0 : Math.round(totalMinutos / quantidade);
  }
  async tempoMedioPorServico(): Promise<TempoMedioPorServico[]> {
    return [...this.servicos].map(([servicoId, a]) => ({
      servicoId,
      nome: a.nome,
      tempoMedioMinutos: Math.round(a.totalMinutos / a.quantidade),
      totalExecucoes: a.quantidade,
    }));
  }
  snapshot(): unknown {
    return { servicos: new Map(this.servicos), execucao: { ...this.execucao } };
  }
  restaurar(estado: unknown): void {
    ({ servicos: this.servicos, execucao: this.execucao } = estado as {
      servicos: Map<string, Acumulado>;
      execucao: { totalMinutos: number; quantidade: number };
    });
  }
}

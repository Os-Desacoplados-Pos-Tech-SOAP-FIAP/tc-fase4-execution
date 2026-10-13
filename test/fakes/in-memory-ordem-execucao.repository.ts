import { ConflitoError } from '../../src/application/errors';
import { OrdemExecucao, TransicaoExecucao } from '../../src/domain/execucao/entities/OrdemExecucao';
import { IOrdemExecucaoRepository } from '../../src/domain/execucao/repositories/IOrdemExecucaoRepository';
import { StatusExecucao } from '../../src/domain/execucao/value-objects/StatusExecucao';
import { ParticipanteTransacao } from './fake-transaction.manager';

interface Estado {
  ordens: Map<string, OrdemExecucao>;
  historicos: Map<string, TransicaoExecucao[]>;
}

function clonar(ordem: OrdemExecucao): OrdemExecucao {
  return OrdemExecucao.restaurar(
    {
      osId: ordem.osId,
      numeroOs: ordem.numeroOs,
      status: ordem.status,
      mecanicoId: ordem.mecanicoId,
      itens: ordem.itens,
      enfileiradoEm: ordem.enfileiradoEm,
      reparoIniciadoEm: ordem.reparoIniciadoEm,
      concluidoEm: ordem.concluidoEm,
      versao: ordem.versao,
      criadoEm: ordem.criadoEm,
      atualizadoEm: ordem.atualizadoEm,
    },
    ordem.id,
  );
}

export class InMemoryOrdemExecucaoRepository
  implements IOrdemExecucaoRepository, ParticipanteTransacao
{
  public ordens = new Map<string, OrdemExecucao>();
  public historicos = new Map<string, TransicaoExecucao[]>();

  async buscarPorOs(osId: string): Promise<OrdemExecucao | null> {
    const ordem = this.ordens.get(osId);
    return ordem ? clonar(ordem) : null;
  }
  async salvar(ordem: OrdemExecucao): Promise<void> {
    const atual = this.ordens.get(ordem.osId);
    if ((atual?.versao ?? 0) !== ordem.versao) {
      throw new ConflitoError(`conflito de versão na OS ${ordem.osId}`);
    }
    const transicoes = ordem.pullTransicoes();
    ordem.avancarVersao();
    this.ordens.set(ordem.osId, clonar(ordem));
    this.historicos.set(ordem.osId, [...(this.historicos.get(ordem.osId) ?? []), ...transicoes]);
  }
  async listarPorStatus(status: readonly StatusExecucao[]): Promise<OrdemExecucao[]> {
    return [...this.ordens.values()]
      .filter((o) => status.includes(o.status))
      .sort((a, b) => a.enfileiradoEm.getTime() - b.enfileiradoEm.getTime())
      .map(clonar);
  }
  async historico(osId: string): Promise<TransicaoExecucao[]> {
    return [...(this.historicos.get(osId) ?? [])];
  }
  snapshot(): unknown {
    return {
      ordens: new Map([...this.ordens].map(([k, v]) => [k, clonar(v)])),
      historicos: new Map([...this.historicos].map(([k, v]) => [k, [...v]])),
    } satisfies Estado;
  }
  restaurar(estado: unknown): void {
    ({ ordens: this.ordens, historicos: this.historicos } = estado as Estado);
  }
}

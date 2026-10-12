import { OrdemExecucao, TransicaoExecucao } from '../entities/OrdemExecucao';
import { StatusExecucao } from '../value-objects/StatusExecucao';

export interface IOrdemExecucaoRepository {
  buscarPorOs(osId: string): Promise<OrdemExecucao | null>;
  /** Grava na transação corrente exigindo a versão lida (conflito → retentativa/409). */
  salvar(ordem: OrdemExecucao): Promise<void>;
  listarPorStatus(status: readonly StatusExecucao[]): Promise<OrdemExecucao[]>;
  historico(osId: string): Promise<TransicaoExecucao[]>;
}

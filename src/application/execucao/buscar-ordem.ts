import { OrdemExecucao } from '../../domain/execucao/entities/OrdemExecucao';
import { IOrdemExecucaoRepository } from '../../domain/execucao/repositories/IOrdemExecucaoRepository';
import { ensureFound } from '../ensure-found';

export async function buscarOrdem(
  ordens: IOrdemExecucaoRepository,
  osId: string,
): Promise<OrdemExecucao> {
  return ensureFound(await ordens.buscarPorOs(osId), 'Ordem de execução');
}

import { OrdemExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { StatusExecucao } from '../../../domain/execucao/value-objects/StatusExecucao';
import { cenario } from '../../../../test/fakes/cenario';
import { RecursoNaoEncontradoError } from '../../errors';
import { ConsultasExecucaoUseCase } from './ConsultasExecucaoUseCase';

describe('ConsultasExecucaoUseCase', () => {
  it('fila mostra só status ativos em ordem de chegada; filtro por status', async () => {
    const c = cenario();
    const a = OrdemExecucao.enfileirarDiagnostico('os-a', c.relogio.agora());
    c.relogio.avancarMinutos(1);
    const b = OrdemExecucao.enfileirarDiagnostico('os-b', c.relogio.agora());
    b.iniciarDiagnostico('mec', c.relogio.agora());
    b.concluirDiagnostico(c.relogio.agora());
    await c.ordens.salvar(a);
    await c.ordens.salvar(b);
    const consultas = new ConsultasExecucaoUseCase(c.ordens, c.metricas);

    expect((await consultas.fila()).map((o) => o.osId)).toEqual(['os-a']);
    expect(
      (await consultas.fila(StatusExecucao.DIAGNOSTICO_CONCLUIDO)).map((o) => o.osId),
    ).toEqual(['os-b']);
  });

  it('detalhe traz ordem e histórico; 404 se não existir', async () => {
    const c = cenario();
    await c.ordens.salvar(OrdemExecucao.enfileirarDiagnostico('os-a', c.relogio.agora()));
    const consultas = new ConsultasExecucaoUseCase(c.ordens, c.metricas);
    const detalhe = await consultas.detalhe('os-a');
    expect(detalhe.ordem.osId).toBe('os-a');
    expect(detalhe.historico).toHaveLength(1);
    await expect(consultas.detalhe('nao-existe')).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });

  it('métricas vêm dos contadores', async () => {
    const c = cenario();
    await c.metricas.registrarExecucaoConcluida(40);
    await c.metricas.registrarServicoExecutado('srv', 'Troca', 10);
    const consultas = new ConsultasExecucaoUseCase(c.ordens, c.metricas);
    expect(await consultas.tempoMedio()).toEqual({ tempoMedioMinutos: 40 });
    expect(await consultas.tempoMedioPorServico()).toHaveLength(1);
  });
});

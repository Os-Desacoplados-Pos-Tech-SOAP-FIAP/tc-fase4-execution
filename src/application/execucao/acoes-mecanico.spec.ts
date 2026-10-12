import { OrdemExecucao } from '../../domain/execucao/entities/OrdemExecucao';
import { StatusExecucao } from '../../domain/execucao/value-objects/StatusExecucao';
import { cenario } from '../../../test/fakes/cenario';
import { RecursoNaoEncontradoError } from '../errors';
import { ApontarServicoUseCase } from './apontar-servico/ApontarServicoUseCase';
import { ConcluirDiagnosticoUseCase } from './concluir-diagnostico/ConcluirDiagnosticoUseCase';
import { ConcluirReparoUseCase } from './concluir-reparo/ConcluirReparoUseCase';
import { EXECUTION_EVENTS } from './execution-messages';
import { IniciarDiagnosticoUseCase } from './iniciar-diagnostico/IniciarDiagnosticoUseCase';
import { IniciarReparoUseCase } from './iniciar-reparo/IniciarReparoUseCase';

const OS = '7f2b2a8e-1d7c-4a35-9c1e-0a4f3b2c1d10';
const ITENS = [
  { itemId: 'item-1', servicoId: 'srv-oleo', descricao: 'Troca de óleo' },
  { itemId: 'item-2', servicoId: 'srv-freio', descricao: 'Revisão de freios' },
];

describe('Ações do mecânico', () => {
  let c: ReturnType<typeof cenario>;
  let iniciarDiagnostico: IniciarDiagnosticoUseCase;
  let concluirDiagnostico: ConcluirDiagnosticoUseCase;
  let iniciarReparo: IniciarReparoUseCase;
  let apontar: ApontarServicoUseCase;
  let concluirReparo: ConcluirReparoUseCase;

  beforeEach(async () => {
    c = cenario();
    iniciarDiagnostico = new IniciarDiagnosticoUseCase(c.transacao, c.ordens, c.outbox, c.relogio);
    concluirDiagnostico = new ConcluirDiagnosticoUseCase(c.transacao, c.ordens, c.outbox, c.relogio);
    iniciarReparo = new IniciarReparoUseCase(c.transacao, c.ordens, c.outbox, c.relogio);
    apontar = new ApontarServicoUseCase(c.transacao, c.ordens, c.metricas, c.outbox, c.relogio);
    concluirReparo = new ConcluirReparoUseCase(
      c.transacao, c.ordens, c.capacidade, c.metricas, c.outbox, c.relogio,
    );
    await c.ordens.salvar(OrdemExecucao.enfileirarDiagnostico(OS, c.relogio.agora(), 42));
  });

  it('fluxo completo publica os eventos na ordem e alimenta as métricas', async () => {
    await iniciarDiagnostico.execute(OS, 'mec-1');
    await concluirDiagnostico.execute(OS);

    // aceite simulado (vem do pivô na fila): ocupa vaga e põe a OS em AGUARDANDO_REPARO
    const ordem = (await c.ordens.buscarPorOs(OS))!;
    ordem.aceitarExecucao(ITENS, c.relogio.agora());
    await c.ordens.salvar(ordem);
    await c.capacidade.ocupar(2);

    await iniciarReparo.execute(OS, 'mec-1');
    await apontar.execute(OS, 'item-1', 'INICIAR');
    c.relogio.avancarMinutos(30);
    await apontar.execute(OS, 'item-1', 'FINALIZAR');
    await apontar.execute(OS, 'item-2', 'INICIAR');
    c.relogio.avancarMinutos(20);
    await apontar.execute(OS, 'item-2', 'FINALIZAR');
    const concluida = await concluirReparo.execute(OS);

    expect(concluida.status).toBe(StatusExecucao.CONCLUIDA);
    expect(c.capacidade.ocupadas).toBe(0);
    expect(c.outbox.tipos()).toEqual([
      EXECUTION_EVENTS.DIAGNOSTICO_INICIADO,
      EXECUTION_EVENTS.DIAGNOSTICO_CONCLUIDO,
      EXECUTION_EVENTS.REPARO_INICIADO,
      EXECUTION_EVENTS.SERVICO_EXECUTADO,
      EXECUTION_EVENTS.SERVICO_EXECUTADO,
      EXECUTION_EVENTS.EXECUCAO_CONCLUIDA,
    ]);
    expect(c.outbox.mensagens[3].payload).toEqual({
      osId: OS, itemId: 'item-1', servicoId: 'srv-oleo', minutos: 30,
    });
    expect(c.outbox.mensagens[5].payload).toEqual({ osId: OS, minutos: 50 });
    expect(c.outbox.mensagens.every((m) => m.correlationId === OS && !m.causationId)).toBe(true);
    expect(await c.metricas.tempoMedioPorServico()).toEqual([
      { servicoId: 'srv-oleo', nome: 'Troca de óleo', tempoMedioMinutos: 30, totalExecucoes: 1 },
      { servicoId: 'srv-freio', nome: 'Revisão de freios', tempoMedioMinutos: 20, totalExecucoes: 1 },
    ]);
    expect(await c.metricas.tempoMedioExecucao()).toBe(50);
  });

  it('INICIAR não publica evento', async () => {
    await iniciarDiagnostico.execute(OS, 'mec-1');
    await concluirDiagnostico.execute(OS);
    const ordem = (await c.ordens.buscarPorOs(OS))!;
    ordem.aceitarExecucao(ITENS, c.relogio.agora());
    await c.ordens.salvar(ordem);
    await iniciarReparo.execute(OS, 'mec-1');
    const antes = c.outbox.mensagens.length;
    await apontar.execute(OS, 'item-1', 'INICIAR');
    expect(c.outbox.mensagens).toHaveLength(antes);
  });

  it('OS inexistente → RecursoNaoEncontradoError (404)', async () => {
    await expect(iniciarDiagnostico.execute('outra-os', 'mec-1')).rejects.toBeInstanceOf(
      RecursoNaoEncontradoError,
    );
  });

  it('regra violada → DomainError e nada é gravado', async () => {
    await expect(concluirDiagnostico.execute(OS)).rejects.toMatchObject({ code: 'TRANSICAO_INVALIDA' });
    expect(c.outbox.mensagens).toHaveLength(0);
    expect((await c.ordens.buscarPorOs(OS))!.versao).toBe(1);
  });
});

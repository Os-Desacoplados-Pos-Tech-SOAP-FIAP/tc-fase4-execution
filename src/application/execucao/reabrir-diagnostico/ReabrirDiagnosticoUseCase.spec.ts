import { OrdemExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { StatusExecucao } from '../../../domain/execucao/value-objects/StatusExecucao';
import { cenario } from '../../../../test/fakes/cenario';
import { EXECUTION_EVENTS } from '../execution-messages';
import { ReabrirDiagnosticoUseCase } from './ReabrirDiagnosticoUseCase';

const OS = '7f2b2a8e-1d7c-4a35-9c1e-0a4f3b2c1d10';

async function comDiagnosticoConcluido(c: ReturnType<typeof cenario>) {
  const ordem = OrdemExecucao.enfileirarDiagnostico(OS, c.relogio.agora());
  ordem.iniciarDiagnostico('mec-1', c.relogio.agora());
  ordem.concluirDiagnostico(c.relogio.agora());
  await c.ordens.salvar(ordem);
}

describe('ReabrirDiagnosticoUseCase', () => {
  it('volta para EM_DIAGNOSTICO e publica diagnostico-iniciado', async () => {
    const c = cenario();
    await comDiagnosticoConcluido(c);
    const useCase = new ReabrirDiagnosticoUseCase(c.transacao, c.processadas, c.ordens, c.outbox, c.relogio);
    await useCase.execute({ messageId: 'm1', correlationId: OS });
    expect((await c.ordens.buscarPorOs(OS))!.status).toBe(StatusExecucao.EM_DIAGNOSTICO);
    expect(c.outbox.mensagens[0]).toMatchObject({
      type: EXECUTION_EVENTS.DIAGNOSTICO_INICIADO,
      correlationId: OS,
      causationId: 'm1',
      payload: { osId: OS, mecanicoId: 'mec-1' },
    });
    expect((await c.ordens.historico(OS)).at(-1)).toMatchObject({
      detalhe: 'diagnóstico concluído sem itens; reaberto pelo orquestrador',
    });
  });

  it('já reaberta: não faz nada (idempotência de negócio)', async () => {
    const c = cenario();
    await comDiagnosticoConcluido(c);
    const useCase = new ReabrirDiagnosticoUseCase(c.transacao, c.processadas, c.ordens, c.outbox, c.relogio);
    await useCase.execute({ messageId: 'm1', correlationId: OS });
    await useCase.execute({ messageId: 'm2', correlationId: OS });
    expect(c.outbox.mensagens).toHaveLength(1);
  });

  it('OS desconhecida é erro (mensagem vai para a DLQ)', async () => {
    const c = cenario();
    const useCase = new ReabrirDiagnosticoUseCase(c.transacao, c.processadas, c.ordens, c.outbox, c.relogio);
    await expect(useCase.execute({ messageId: 'm1', correlationId: OS })).rejects.toMatchObject({
      code: 'ORDEM_NAO_ENCONTRADA',
    });
    expect(c.processadas.ids.size).toBe(0);
  });
});

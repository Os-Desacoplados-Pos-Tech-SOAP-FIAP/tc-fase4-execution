import { Logger } from '@nestjs/common';

import { OrdemExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { StatusExecucao } from '../../../domain/execucao/value-objects/StatusExecucao';
import { UniqueID } from '../../../domain/shared/UniqueID';
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

  it('estado inesperado: registra aviso e encerra sem erro (sem DLQ)', async () => {
    const c = cenario();
    await comDiagnosticoConcluido(c);
    const ordem = (await c.ordens.buscarPorOs(OS))!;
    ordem.aceitarExecucao([{ itemId: 'i1', servicoId: 's1', descricao: 'Troca' }], c.relogio.agora());
    await c.ordens.salvar(ordem);
    const aviso = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const useCase = new ReabrirDiagnosticoUseCase(c.transacao, c.processadas, c.ordens, c.outbox, c.relogio);

    await expect(useCase.execute({ messageId: 'm1', correlationId: OS })).resolves.toBeUndefined();

    expect((await c.ordens.buscarPorOs(OS))!.status).toBe(StatusExecucao.AGUARDANDO_REPARO);
    expect(c.outbox.mensagens).toHaveLength(0);
    expect(aviso).toHaveBeenCalledWith(
      expect.objectContaining({ osId: OS, status: StatusExecucao.AGUARDANDO_REPARO, messageId: 'm1' }),
    );
    aviso.mockRestore();
  });

  it('ordem sem mecânico é erro de mapeamento: nada é publicado', async () => {
    const c = cenario();
    const semMecanico = OrdemExecucao.restaurar(
      {
        osId: OS,
        status: StatusExecucao.DIAGNOSTICO_CONCLUIDO,
        itens: [],
        enfileiradoEm: c.relogio.agora(),
        versao: 0,
      },
      new UniqueID(),
    );
    await c.ordens.salvar(semMecanico);
    const useCase = new ReabrirDiagnosticoUseCase(c.transacao, c.processadas, c.ordens, c.outbox, c.relogio);

    await expect(useCase.execute({ messageId: 'm1', correlationId: OS })).rejects.toThrow(
      'sem mecânico',
    );
    expect(c.outbox.mensagens).toHaveLength(0);
    expect((await c.ordens.buscarPorOs(OS))!.status).toBe(StatusExecucao.DIAGNOSTICO_CONCLUIDO);
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

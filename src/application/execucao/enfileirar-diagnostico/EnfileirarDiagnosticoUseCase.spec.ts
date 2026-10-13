import { StatusExecucao } from '../../../domain/execucao/value-objects/StatusExecucao';
import { cenario } from '../../../../test/fakes/cenario';
import { EnfileirarDiagnosticoUseCase } from './EnfileirarDiagnosticoUseCase';

const OS = '7f2b2a8e-1d7c-4a35-9c1e-0a4f3b2c1d10';

describe('EnfileirarDiagnosticoUseCase', () => {
  it('coloca a OS na fila de diagnóstico, sem publicar evento', async () => {
    const c = cenario();
    const useCase = new EnfileirarDiagnosticoUseCase(c.transacao, c.processadas, c.ordens, c.relogio);
    await useCase.execute({ messageId: 'm1', correlationId: OS, numeroOs: 42 });
    const ordem = await c.ordens.buscarPorOs(OS);
    expect(ordem).toMatchObject({ status: StatusExecucao.AGUARDANDO_DIAGNOSTICO, numeroOs: 42 });
    expect(c.outbox.mensagens).toHaveLength(0);
  });

  it('é idempotente por messageId e por OS', async () => {
    const c = cenario();
    const useCase = new EnfileirarDiagnosticoUseCase(c.transacao, c.processadas, c.ordens, c.relogio);
    await useCase.execute({ messageId: 'm1', correlationId: OS });
    await useCase.execute({ messageId: 'm1', correlationId: OS });
    await useCase.execute({ messageId: 'm2', correlationId: OS });
    expect((await c.ordens.buscarPorOs(OS))!.versao).toBe(1);
  });
});

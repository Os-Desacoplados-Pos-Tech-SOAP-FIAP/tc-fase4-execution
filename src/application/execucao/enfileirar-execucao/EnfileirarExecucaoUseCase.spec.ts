import { OrdemExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { StatusExecucao } from '../../../domain/execucao/value-objects/StatusExecucao';
import { cenario } from '../../../../test/fakes/cenario';
import { EXECUTION_EVENTS } from '../execution-messages';
import { EnfileirarExecucaoUseCase } from './EnfileirarExecucaoUseCase';

const OS_A = '7f2b2a8e-1d7c-4a35-9c1e-0a4f3b2c1d10';
const OS_B = '8a3c3b9f-2e8d-4b46-8d2f-1b5a4c3d2e21';
const OS_C = '9b4d4c0a-3f9e-4c57-9e3a-2c6b5d4e3f32';
const ITENS = [{ itemId: 'item-1', servicoId: 'srv-oleo', descricao: 'Troca de óleo' }];

describe('EnfileirarExecucaoUseCase (pivô da saga)', () => {
  let c: ReturnType<typeof cenario>;
  let useCase: EnfileirarExecucaoUseCase;

  const prontaParaAceite = async (osId: string) => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(osId, c.relogio.agora());
    ordem.iniciarDiagnostico('mec-1', c.relogio.agora());
    ordem.concluirDiagnostico(c.relogio.agora());
    await c.ordens.salvar(ordem);
  };
  const comando = (osId: string, messageId = `cmd-${osId}`) => ({
    messageId,
    correlationId: osId,
    itens: ITENS,
  });

  beforeEach(() => {
    c = cenario(2);
    useCase = new EnfileirarExecucaoUseCase(
      c.transacao, c.processadas, c.ordens, c.capacidade, c.outbox, c.relogio, c.config,
    );
  });

  it('aceita, ocupa capacidade e publica execucao-aceita', async () => {
    await prontaParaAceite(OS_A);
    await useCase.execute(comando(OS_A));
    expect((await c.ordens.buscarPorOs(OS_A))!.status).toBe(StatusExecucao.AGUARDANDO_REPARO);
    expect(c.capacidade.ocupadas).toBe(1);
    expect(c.outbox.mensagens[0]).toMatchObject({
      type: EXECUTION_EVENTS.EXECUCAO_ACEITA,
      payload: { osId: OS_A },
      causationId: `cmd-${OS_A}`,
    });
  });

  it('recusa com CAPACIDADE_ESGOTADA quando a fila está cheia', async () => {
    for (const os of [OS_A, OS_B, OS_C]) await prontaParaAceite(os);
    await useCase.execute(comando(OS_A));
    await useCase.execute(comando(OS_B));
    await useCase.execute(comando(OS_C));
    expect(c.capacidade.ocupadas).toBe(2);
    expect((await c.ordens.buscarPorOs(OS_C))!.status).toBe(StatusExecucao.EXECUCAO_RECUSADA);
    expect(c.outbox.mensagens.at(-1)).toMatchObject({
      type: EXECUTION_EVENTS.EXECUCAO_RECUSADA,
      payload: { osId: OS_C, motivo: 'CAPACIDADE_ESGOTADA' },
    });
  });

  it('recusa OS desconhecida', async () => {
    await useCase.execute(comando(OS_A));
    expect(c.outbox.mensagens[0]).toMatchObject({
      type: EXECUTION_EVENTS.EXECUCAO_RECUSADA,
      payload: { motivo: 'ORDEM_NAO_ENCONTRADA' },
    });
  });

  it('recusa OS em estado inválido (ainda em diagnóstico) sem alterar a ordem', async () => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(OS_A, c.relogio.agora());
    await c.ordens.salvar(ordem);
    await useCase.execute(comando(OS_A));
    expect((await c.ordens.buscarPorOs(OS_A))!.status).toBe(StatusExecucao.AGUARDANDO_DIAGNOSTICO);
    expect(c.outbox.mensagens[0].payload).toMatchObject({ motivo: 'ORDEM_EM_ESTADO_INVALIDO' });
  });

  it('comando repetido com outro messageId após o aceite reconfirma sem ocupar de novo', async () => {
    await prontaParaAceite(OS_A);
    await useCase.execute(comando(OS_A, 'cmd-1'));
    await useCase.execute(comando(OS_A, 'cmd-2'));
    expect(c.capacidade.ocupadas).toBe(1);
    expect(c.outbox.tipos()).toEqual([
      EXECUTION_EVENTS.EXECUCAO_ACEITA,
      EXECUTION_EVENTS.EXECUCAO_ACEITA,
    ]);
  });

  it('é idempotente por messageId (aceite e recusa)', async () => {
    await prontaParaAceite(OS_A);
    await useCase.execute(comando(OS_A));
    await useCase.execute(comando(OS_A));
    await useCase.execute(comando(OS_B));
    await useCase.execute(comando(OS_B));
    expect(c.outbox.mensagens).toHaveLength(2);
  });

  it('erro de infraestrutura propaga sem registrar a mensagem (retentativa)', async () => {
    await prontaParaAceite(OS_A);
    jest.spyOn(c.capacidade, 'ocupar').mockRejectedValueOnce(new Error('conflito na gravação'));
    await expect(useCase.execute(comando(OS_A))).rejects.toThrow('conflito na gravação');
    expect(c.processadas.ids.size).toBe(0);
    expect((await c.ordens.buscarPorOs(OS_A))!.status).toBe(StatusExecucao.DIAGNOSTICO_CONCLUIDO);
  });
});

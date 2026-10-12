import { DomainError } from '../../shared/DomainError';
import { StatusExecucao } from '../value-objects/StatusExecucao';
import { OrdemExecucao } from './OrdemExecucao';

const OS = '7f2b2a8e-1d7c-4a35-9c1e-0a4f3b2c1d10';
const MECANICO = 'mecanico-1';
const t = (minutos: number) => new Date(Date.UTC(2026, 9, 20, 10, minutos));
const ITENS = [
  { itemId: 'item-1', servicoId: 'srv-oleo', descricao: 'Troca de óleo' },
  { itemId: 'item-2', servicoId: 'srv-freio', descricao: 'Revisão de freios' },
];

function emReparo(): OrdemExecucao {
  const ordem = OrdemExecucao.enfileirarDiagnostico(OS, t(0), 42);
  ordem.iniciarDiagnostico(MECANICO, t(1));
  ordem.concluirDiagnostico(t(5));
  ordem.aceitarExecucao(ITENS, t(6));
  ordem.iniciarReparo(MECANICO, t(10));
  return ordem;
}

describe('OrdemExecucao', () => {
  it('entra na fila aguardando diagnóstico, com versão 0 e transição registrada', () => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(OS, t(0), 42);
    expect(ordem.status).toBe(StatusExecucao.AGUARDANDO_DIAGNOSTICO);
    expect(ordem.numeroOs).toBe(42);
    expect(ordem.versao).toBe(0);
    expect(ordem.pullTransicoes()).toEqual([
      { de: null, para: StatusExecucao.AGUARDANDO_DIAGNOSTICO, em: t(0) },
    ]);
    expect(ordem.pullTransicoes()).toEqual([]);
  });

  it('rejeita OS vazia', () => {
    expect(() => OrdemExecucao.enfileirarDiagnostico(' ', t(0))).toThrow(DomainError);
  });

  it('percorre diagnóstico → aceite → reparo → conclusão', () => {
    const ordem = emReparo();
    ordem.iniciarServico('item-1', t(10));
    expect(ordem.finalizarServico('item-1', t(40))).toBe(30);
    ordem.iniciarServico('item-2', t(40));
    expect(ordem.finalizarServico('item-2', t(55))).toBe(15);
    expect(ordem.concluirReparo(t(60))).toBe(50);
    expect(ordem.status).toBe(StatusExecucao.CONCLUIDA);
    expect(ordem.pullTransicoes().map((x) => x.para)).toEqual([
      StatusExecucao.AGUARDANDO_DIAGNOSTICO,
      StatusExecucao.EM_DIAGNOSTICO,
      StatusExecucao.DIAGNOSTICO_CONCLUIDO,
      StatusExecucao.AGUARDANDO_REPARO,
      StatusExecucao.EM_REPARO,
      StatusExecucao.CONCLUIDA,
    ]);
  });

  it('reabre diagnóstico concluído (sem itens no orçamento)', () => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(OS, t(0));
    ordem.iniciarDiagnostico(MECANICO, t(1));
    ordem.concluirDiagnostico(t(2));
    ordem.reabrirDiagnostico(t(3), 'diagnóstico sem itens');
    expect(ordem.status).toBe(StatusExecucao.EM_DIAGNOSTICO);
    expect(ordem.pullTransicoes().at(-1)).toEqual({
      de: StatusExecucao.DIAGNOSTICO_CONCLUIDO,
      para: StatusExecucao.EM_DIAGNOSTICO,
      em: t(3),
      detalhe: 'diagnóstico sem itens',
    });
  });

  it('recusa a execução (pivô) e fica terminal', () => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(OS, t(0));
    ordem.iniciarDiagnostico(MECANICO, t(1));
    ordem.concluirDiagnostico(t(2));
    ordem.recusarExecucao('CAPACIDADE_ESGOTADA', t(3));
    expect(ordem.status).toBe(StatusExecucao.EXECUCAO_RECUSADA);
    expect(() => ordem.aceitarExecucao(ITENS, t(4))).toThrow(
      expect.objectContaining({ code: 'TRANSICAO_INVALIDA' }),
    );
  });

  it('aceita execução sem itens de serviço e permite concluir direto', () => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(OS, t(0));
    ordem.iniciarDiagnostico(MECANICO, t(1));
    ordem.concluirDiagnostico(t(2));
    ordem.aceitarExecucao([], t(3));
    ordem.iniciarReparo(MECANICO, t(4));
    expect(ordem.concluirReparo(t(5))).toBe(1);
  });

  it.each([
    ['iniciar diagnóstico duas vezes', (o: OrdemExecucao) => o.iniciarDiagnostico(MECANICO, t(2))],
    ['concluir reparo sem iniciar', (o: OrdemExecucao) => o.concluirReparo(t(2))],
    ['aceitar execução em diagnóstico', (o: OrdemExecucao) => o.aceitarExecucao(ITENS, t(2))],
  ])('rejeita transição inválida: %s', (_caso, acao) => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(OS, t(0));
    ordem.iniciarDiagnostico(MECANICO, t(1));
    expect(() => acao(ordem)).toThrow(expect.objectContaining({ code: 'TRANSICAO_INVALIDA' }));
  });

  it('exige mecânico para iniciar diagnóstico e reparo', () => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(OS, t(0));
    expect(() => ordem.iniciarDiagnostico('', t(1))).toThrow(
      expect.objectContaining({ code: 'MECANICO_OBRIGATORIO' }),
    );
  });

  it('rejeita itens repetidos no aceite', () => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(OS, t(0));
    ordem.iniciarDiagnostico(MECANICO, t(1));
    ordem.concluirDiagnostico(t(2));
    expect(() => ordem.aceitarExecucao([ITENS[0], ITENS[0]], t(3))).toThrow(
      expect.objectContaining({ code: 'ITEM_DUPLICADO' }),
    );
  });

  it('protege o apontamento de serviço', () => {
    const ordem = emReparo();
    expect(() => ordem.iniciarServico('nao-existe', t(11))).toThrow(
      expect.objectContaining({ code: 'ITEM_NAO_ENCONTRADO' }),
    );
    expect(() => ordem.finalizarServico('item-1', t(11))).toThrow(
      expect.objectContaining({ code: 'SERVICO_NAO_INICIADO' }),
    );
    ordem.iniciarServico('item-1', t(11));
    expect(() => ordem.iniciarServico('item-1', t(12))).toThrow(
      expect.objectContaining({ code: 'SERVICO_JA_INICIADO' }),
    );
    ordem.finalizarServico('item-1', t(12));
    expect(() => ordem.finalizarServico('item-1', t(13))).toThrow(
      expect.objectContaining({ code: 'SERVICO_JA_FINALIZADO' }),
    );
  });

  it('não conclui reparo com serviço pendente', () => {
    const ordem = emReparo();
    expect(() => ordem.concluirReparo(t(20))).toThrow(
      expect.objectContaining({ code: 'SERVICOS_PENDENTES' }),
    );
  });

  it('duração mínima de 1 minuto', () => {
    const ordem = emReparo();
    ordem.iniciarServico('item-1', t(10));
    expect(ordem.finalizarServico('item-1', t(10))).toBe(1);
  });

  it('itens expostos são cópia', () => {
    const ordem = emReparo();
    ordem.itens[0].fim = t(99);
    expect(ordem.itens[0].fim).toBeUndefined();
  });

  it('avança a versão de forma explícita (controle otimista)', () => {
    const ordem = OrdemExecucao.enfileirarDiagnostico(OS, t(0));
    expect(ordem.avancarVersao()).toBe(1);
    expect(ordem.versao).toBe(1);
  });
});

import { OrdemExecucao } from '../../src/domain/execucao/entities/OrdemExecucao';
import { StatusExecucao } from '../../src/domain/execucao/value-objects/StatusExecucao';
import { lerDynamoConfig } from '../../src/infrastructure/dynamo/dynamo.config';
import { ConcorrenciaError } from '../../src/infrastructure/dynamo/concorrencia.error';
import { DynamoUnitOfWork } from '../../src/infrastructure/dynamo/dynamo-unit-of-work';
import { DynamoCapacidade } from '../../src/infrastructure/repositories/DynamoCapacidade';
import { DynamoMetricas } from '../../src/infrastructure/repositories/DynamoMetricas';
import { DynamoOrdemExecucaoRepository } from '../../src/infrastructure/repositories/DynamoOrdemExecucaoRepository';
import { DynamoProcessedMessageRepository } from '../../src/infrastructure/repositories/DynamoProcessedMessageRepository';
import { documentoTeste } from '../helpers/dynamo';
import { limparTabela } from '../helpers/limpar-tabela';

const t = (min: number) => new Date(Date.UTC(2026, 9, 20, 10, min));

describe('Repositórios DynamoDB (integração)', () => {
  const doc = documentoTeste();
  const config = lerDynamoConfig(process.env);
  const uow = new DynamoUnitOfWork(doc);
  const ordens = new DynamoOrdemExecucaoRepository(doc, uow, config);
  const capacidade = new DynamoCapacidade(doc, uow, config);
  const metricas = new DynamoMetricas(doc, uow, config);
  const processadas = new DynamoProcessedMessageRepository(doc, uow, config);

  beforeEach(() => limparTabela(doc));

  describe('DynamoOrdemExecucaoRepository', () => {
    it('salva, relê com itens e datas, grava histórico e avança a versão', async () => {
      const ordem = OrdemExecucao.enfileirarDiagnostico('os-1', t(0), 42);
      ordem.iniciarDiagnostico('mec', t(1));
      ordem.concluirDiagnostico(t(2));
      ordem.aceitarExecucao([{ itemId: 'i1', servicoId: 's1', descricao: 'Troca' }], t(3));
      await uow.run(() => ordens.salvar(ordem));

      const lida = (await ordens.buscarPorOs('os-1'))!;
      expect(lida.versao).toBe(1);
      expect(lida.status).toBe(StatusExecucao.AGUARDANDO_REPARO);
      expect(lida.numeroOs).toBe(42);
      expect(lida.enfileiradoEm).toEqual(t(0));
      expect(lida.itens).toEqual([{ itemId: 'i1', servicoId: 's1', descricao: 'Troca' }]);
      expect((await ordens.historico('os-1')).map((h) => h.para)).toEqual([
        StatusExecucao.AGUARDANDO_DIAGNOSTICO,
        StatusExecucao.EM_DIAGNOSTICO,
        StatusExecucao.DIAGNOSTICO_CONCLUIDO,
        StatusExecucao.AGUARDANDO_REPARO,
      ]);
      expect(await ordens.buscarPorOs('nao-existe')).toBeNull();
    });

    it('apontamentos com datas sobrevivem ao round-trip', async () => {
      const ordem = OrdemExecucao.enfileirarDiagnostico('os-1', t(0));
      ordem.iniciarDiagnostico('mec', t(1));
      ordem.concluirDiagnostico(t(2));
      ordem.aceitarExecucao([{ itemId: 'i1', servicoId: 's1', descricao: 'Troca' }], t(3));
      ordem.iniciarReparo('mec', t(4));
      ordem.iniciarServico('i1', t(5));
      await uow.run(() => ordens.salvar(ordem));
      const lida = (await ordens.buscarPorOs('os-1'))!;
      expect(lida.itens[0].inicio).toEqual(t(5));
      expect(lida.reparoIniciadoEm).toEqual(t(4));
    });

    it('versão desatualizada → ConcorrenciaError (controle otimista)', async () => {
      await uow.run(() => ordens.salvar(OrdemExecucao.enfileirarDiagnostico('os-1', t(0))));
      const a = (await ordens.buscarPorOs('os-1'))!;
      const b = (await ordens.buscarPorOs('os-1'))!;
      a.iniciarDiagnostico('mec-a', t(1));
      await uow.run(() => ordens.salvar(a));
      b.iniciarDiagnostico('mec-b', t(1));
      await expect(uow.run(() => ordens.salvar(b))).rejects.toBeInstanceOf(ConcorrenciaError);
    });

    it('ordem nova já existente → ConcorrenciaError', async () => {
      await uow.run(() => ordens.salvar(OrdemExecucao.enfileirarDiagnostico('os-1', t(0))));
      await expect(
        uow.run(() => ordens.salvar(OrdemExecucao.enfileirarDiagnostico('os-1', t(1)))),
      ).rejects.toBeInstanceOf(ConcorrenciaError);
    });

    it('lista por status em ordem de chegada (GSI)', async () => {
      await uow.run(() => ordens.salvar(OrdemExecucao.enfileirarDiagnostico('os-b', t(2))));
      await uow.run(() => ordens.salvar(OrdemExecucao.enfileirarDiagnostico('os-a', t(1))));
      const c = OrdemExecucao.enfileirarDiagnostico('os-c', t(3));
      c.iniciarDiagnostico('mec', t(4));
      await uow.run(() => ordens.salvar(c));

      expect((await ordens.listarPorStatus([StatusExecucao.AGUARDANDO_DIAGNOSTICO])).map((o) => o.osId))
        .toEqual(['os-a', 'os-b']);
      expect(
        (await ordens.listarPorStatus([StatusExecucao.EM_DIAGNOSTICO, StatusExecucao.AGUARDANDO_DIAGNOSTICO]))
          .map((o) => o.osId),
      ).toEqual(['os-a', 'os-b', 'os-c']);
    });

    it('buscarPorOs dentro da transação registra a versão lida para a outbox', async () => {
      await uow.run(() => ordens.salvar(OrdemExecucao.enfileirarDiagnostico('os-1', t(0))));
      await uow.run(async () => {
        await ordens.buscarPorOs('os-1');
        expect(uow.versaoDe('os-1')).toBe(1);
      });
    });
  });

  describe('DynamoCapacidade', () => {
    it('ocupa até o máximo e libera', async () => {
      expect(await capacidade.ativos()).toBe(0);
      await uow.run(() => capacidade.ocupar(2));
      await uow.run(() => capacidade.ocupar(2));
      expect(await capacidade.ativos()).toBe(2);
      await expect(uow.run(() => capacidade.ocupar(2))).rejects.toBeInstanceOf(ConcorrenciaError);
      await uow.run(() => capacidade.liberar());
      expect(await capacidade.ativos()).toBe(1);
    });

    it('não fica negativa', async () => {
      await expect(uow.run(() => capacidade.liberar())).rejects.toBeInstanceOf(ConcorrenciaError);
    });
  });

  describe('DynamoMetricas', () => {
    it('acumula e calcula médias', async () => {
      expect(await metricas.tempoMedioExecucao()).toBe(0);
      await uow.run(async () => {
        await metricas.registrarServicoExecutado('s1', 'Troca de óleo', 30);
        await metricas.registrarExecucaoConcluida(50);
      });
      await uow.run(async () => {
        await metricas.registrarServicoExecutado('s1', 'Troca de óleo', 20);
        await metricas.registrarExecucaoConcluida(30);
      });
      expect(await metricas.tempoMedioExecucao()).toBe(40);
      expect(await metricas.tempoMedioPorServico()).toEqual([
        { servicoId: 's1', nome: 'Troca de óleo', tempoMedioMinutos: 25, totalExecucoes: 2 },
      ]);
    });
  });

  describe('DynamoProcessedMessageRepository', () => {
    it('registra uma vez; a repetição é detectada', async () => {
      expect(await uow.run(() => processadas.registrar('m1'))).toBe(true);
      expect(await uow.run(() => processadas.registrar('m1'))).toBe(false);
    });

    it('duas entregas simultâneas: uma grava, a outra vira ConcorrenciaError', async () => {
      const resultados = await Promise.allSettled([
        uow.run(() => processadas.registrar('m2')),
        uow.run(() => processadas.registrar('m2')),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.find((r) => r.status === 'rejected')).toMatchObject({
        reason: expect.any(ConcorrenciaError),
      });
    });
  });
});

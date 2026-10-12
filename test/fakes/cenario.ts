import { FakeTransactionManager } from './fake-transaction.manager';
import { InMemoryCapacidade } from './in-memory-capacidade';
import { InMemoryMetricas } from './in-memory-metricas';
import { InMemoryOrdemExecucaoRepository } from './in-memory-ordem-execucao.repository';
import { InMemoryOutbox } from './in-memory-outbox';
import { InMemoryProcessedMessageRepository } from './in-memory-processed-message.repository';
import { RelogioFixo } from './relogio-fixo';

/** Dependências em memória com rollback, compartilhadas pelos specs de casos de uso. */
export function cenario(capacidadeMaxima = 2) {
  const ordens = new InMemoryOrdemExecucaoRepository();
  const capacidade = new InMemoryCapacidade();
  const metricas = new InMemoryMetricas();
  const processadas = new InMemoryProcessedMessageRepository();
  const outbox = new InMemoryOutbox();
  const relogio = new RelogioFixo();
  const transacao = new FakeTransactionManager().participar(
    ordens,
    capacidade,
    metricas,
    processadas,
    outbox,
  );
  return {
    ordens,
    capacidade,
    metricas,
    processadas,
    outbox,
    relogio,
    transacao,
    config: { capacidadeMaxima },
  };
}

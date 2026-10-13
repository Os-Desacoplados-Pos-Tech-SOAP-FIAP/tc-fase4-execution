// chaves.ts — único lugar que conhece o desenho da tabela.
const pad = (n: number, tamanho: number) => String(n).padStart(tamanho, '0');

export const chaves = {
  ordem: (osId: string) => ({ PK: `OS#${osId}`, SK: 'ORDEM' }),
  historico: (osId: string, em: Date, versao: number, indice: number) => ({
    PK: `OS#${osId}`,
    SK: `HIST#${em.toISOString()}#${pad(versao, 10)}#${pad(indice, 3)}`,
  }),
  fila: (status: string, enfileiradoEm: Date, osId: string) => ({
    GSI1PK: `FILA#${status}`,
    GSI1SK: `${enfileiradoEm.toISOString()}#${osId}`,
  }),
  capacidade: { PK: 'CAPACIDADE', SK: 'EXECUCAO' },
  metricaExecucao: { PK: 'METRICA', SK: 'EXECUCAO' },
  metricaServico: (servicoId: string) => ({ PK: 'METRICA', SK: `SERVICO#${servicoId}` }),
  mensagem: (messageId: string) => ({ PK: `MSG#${messageId}`, SK: 'MSG' }),
  /** Ordem da outbox por OS: versão da ordem gravada na transação + índice dentro dela. */
  outbox: (osId: string, versao: number, indice: number, messageId: string) => ({
    PK: 'OUTBOX',
    SK: `${osId}#${pad(versao, 10)}#${pad(indice, 3)}#${messageId}`,
  }),
  lockOutbox: { PK: 'LOCK', SK: 'OUTBOX_PUBLISHER' },
};

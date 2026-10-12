export const EXECUTION_COMMANDS = {
  ENFILEIRAR_DIAGNOSTICO: 'execution.enfileirar-diagnostico.v1',
  REABRIR_DIAGNOSTICO: 'execution.reabrir-diagnostico.v1',
  ENFILEIRAR_EXECUCAO: 'execution.enfileirar-execucao.v1',
} as const;

export const EXECUTION_EVENTS = {
  DIAGNOSTICO_INICIADO: 'execution.diagnostico-iniciado.v1',
  DIAGNOSTICO_CONCLUIDO: 'execution.diagnostico-concluido.v1',
  EXECUCAO_ACEITA: 'execution.execucao-aceita.v1',
  EXECUCAO_RECUSADA: 'execution.execucao-recusada.v1',
  REPARO_INICIADO: 'execution.reparo-iniciado.v1',
  SERVICO_EXECUTADO: 'execution.servico-executado.v1',
  EXECUCAO_CONCLUIDA: 'execution.execucao-concluida.v1',
} as const;

export interface ItemExecucaoPayload {
  itemId: string;
  servicoId: string;
  descricao: string;
}

export interface DiagnosticoIniciadoPayload {
  osId: string;
  mecanicoId: string;
}
export interface OsPayload {
  osId: string;
}
export interface ExecucaoRecusadaPayload {
  osId: string;
  motivo: string;
  mensagem: string;
}
export interface ReparoIniciadoPayload {
  osId: string;
  mecanicoId: string;
}
export interface ServicoExecutadoPayload {
  osId: string;
  itemId: string;
  servicoId: string;
  minutos: number;
}
export interface ExecucaoConcluidaPayload {
  osId: string;
  minutos: number;
}

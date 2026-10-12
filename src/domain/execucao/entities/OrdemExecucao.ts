import { AggregateRoot } from '../../shared/AggregateRoot';
import { DomainError } from '../../shared/DomainError';
import { EntityProps } from '../../shared/Entity';
import { UniqueID } from '../../shared/UniqueID';
import { StatusExecucao } from '../value-objects/StatusExecucao';

const MINUTO_MS = 60_000;

export interface ItemExecucao {
  itemId: string;
  servicoId: string;
  descricao: string;
  inicio?: Date;
  fim?: Date;
}

export type NovoItemExecucao = Pick<ItemExecucao, 'itemId' | 'servicoId' | 'descricao'>;

export interface TransicaoExecucao {
  de: StatusExecucao | null;
  para: StatusExecucao;
  em: Date;
  detalhe?: string;
}

export interface OrdemExecucaoProps extends EntityProps {
  osId: string;
  numeroOs?: number;
  status: StatusExecucao;
  mecanicoId?: string;
  itens: ItemExecucao[];
  enfileiradoEm: Date;
  reparoIniciadoEm?: Date;
  concluidoEm?: Date;
  versao: number;
}

function duracaoEmMinutos(inicio: Date, fim: Date): number {
  return Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / MINUTO_MS));
}

/**
 * Situação de uma OS na oficina: fila de diagnóstico, diagnóstico, aceite da execução
 * (transação pivô da saga), reparo com apontamento por serviço e conclusão.
 */
export class OrdemExecucao extends AggregateRoot<OrdemExecucaoProps> {
  private transicoes: TransicaoExecucao[] = [];

  private constructor(props: OrdemExecucaoProps, id?: UniqueID) {
    super(props, id);
  }

  public static enfileirarDiagnostico(osId: string, em: Date, numeroOs?: number): OrdemExecucao {
    if (!osId || osId.trim() === '') {
      throw new DomainError('OS da ordem de execução é obrigatória', 'ORDEM_OS_OBRIGATORIA');
    }
    const ordem = new OrdemExecucao({
      osId,
      numeroOs,
      status: StatusExecucao.AGUARDANDO_DIAGNOSTICO,
      itens: [],
      enfileiradoEm: em,
      versao: 0,
    });
    ordem.transicoes.push({ de: null, para: StatusExecucao.AGUARDANDO_DIAGNOSTICO, em });
    return ordem;
  }

  public static restaurar(props: OrdemExecucaoProps, id: UniqueID): OrdemExecucao {
    return new OrdemExecucao({ ...props, itens: props.itens.map((item) => ({ ...item })) }, id);
  }

  public get osId(): string {
    return this.props.osId;
  }
  public get numeroOs(): number | undefined {
    return this.props.numeroOs;
  }
  public get status(): StatusExecucao {
    return this.props.status;
  }
  public get mecanicoId(): string | undefined {
    return this.props.mecanicoId;
  }
  public get itens(): ItemExecucao[] {
    return this.props.itens.map((item) => ({ ...item }));
  }
  public get enfileiradoEm(): Date {
    return this.props.enfileiradoEm;
  }
  public get reparoIniciadoEm(): Date | undefined {
    return this.props.reparoIniciadoEm;
  }
  public get concluidoEm(): Date | undefined {
    return this.props.concluidoEm;
  }
  public get versao(): number {
    return this.props.versao;
  }

  public iniciarDiagnostico(mecanicoId: string, em: Date): void {
    this.exigir(StatusExecucao.AGUARDANDO_DIAGNOSTICO);
    this.props.mecanicoId = this.mecanicoValido(mecanicoId);
    this.mudar(StatusExecucao.EM_DIAGNOSTICO, em, `mecânico ${mecanicoId}`);
  }

  public concluirDiagnostico(em: Date): void {
    this.exigir(StatusExecucao.EM_DIAGNOSTICO);
    this.mudar(StatusExecucao.DIAGNOSTICO_CONCLUIDO, em);
  }

  public reabrirDiagnostico(em: Date, motivo: string): void {
    this.exigir(StatusExecucao.DIAGNOSTICO_CONCLUIDO);
    this.mudar(StatusExecucao.EM_DIAGNOSTICO, em, motivo);
  }

  /** Transação pivô da saga: a partir daqui a OS só avança. */
  public aceitarExecucao(itens: NovoItemExecucao[], em: Date): void {
    this.exigir(StatusExecucao.DIAGNOSTICO_CONCLUIDO);
    const ids = new Set<string>();
    for (const item of itens) {
      if (ids.has(item.itemId)) {
        throw new DomainError(`Item ${item.itemId} repetido na execução`, 'ITEM_DUPLICADO');
      }
      ids.add(item.itemId);
    }
    this.props.itens = itens.map((item) => ({ ...item }));
    this.mudar(StatusExecucao.AGUARDANDO_REPARO, em);
  }

  public recusarExecucao(motivo: string, em: Date): void {
    this.exigir(StatusExecucao.DIAGNOSTICO_CONCLUIDO);
    this.mudar(StatusExecucao.EXECUCAO_RECUSADA, em, motivo);
  }

  public iniciarReparo(mecanicoId: string, em: Date): void {
    this.exigir(StatusExecucao.AGUARDANDO_REPARO);
    this.props.mecanicoId = this.mecanicoValido(mecanicoId);
    this.props.reparoIniciadoEm = em;
    this.mudar(StatusExecucao.EM_REPARO, em, `mecânico ${mecanicoId}`);
  }

  public iniciarServico(itemId: string, em: Date): void {
    this.exigir(StatusExecucao.EM_REPARO);
    const item = this.localizarItem(itemId);
    if (item.inicio) {
      throw new DomainError(`Serviço ${itemId} já foi iniciado`, 'SERVICO_JA_INICIADO');
    }
    item.inicio = em;
    this.touch();
  }

  /** Retorna a duração do serviço em minutos (mínimo 1). */
  public finalizarServico(itemId: string, em: Date): number {
    this.exigir(StatusExecucao.EM_REPARO);
    const item = this.localizarItem(itemId);
    if (!item.inicio) {
      throw new DomainError(`Serviço ${itemId} não foi iniciado`, 'SERVICO_NAO_INICIADO');
    }
    if (item.fim) {
      throw new DomainError(`Serviço ${itemId} já foi finalizado`, 'SERVICO_JA_FINALIZADO');
    }
    item.fim = em;
    this.touch();
    return duracaoEmMinutos(item.inicio, em);
  }

  /** Retorna a duração total do reparo em minutos (mínimo 1). */
  public concluirReparo(em: Date): number {
    this.exigir(StatusExecucao.EM_REPARO);
    const pendente = this.props.itens.find((item) => !item.fim);
    if (pendente) {
      throw new DomainError(
        `Serviço ${pendente.itemId} ainda não foi finalizado`,
        'SERVICOS_PENDENTES',
      );
    }
    this.props.concluidoEm = em;
    this.mudar(StatusExecucao.CONCLUIDA, em);
    return duracaoEmMinutos(this.props.reparoIniciadoEm as Date, em);
  }

  /** Controle otimista: o repositório grava `versao + 1` exigindo a versão anterior. */
  public avancarVersao(): number {
    this.props.versao += 1;
    return this.props.versao;
  }

  public pullTransicoes(): TransicaoExecucao[] {
    const transicoes = this.transicoes;
    this.transicoes = [];
    return transicoes;
  }

  private exigir(esperado: StatusExecucao): void {
    if (this.props.status !== esperado) {
      throw new DomainError(
        `Ordem da OS ${this.props.osId} está em ${this.props.status}; esperado ${esperado}`,
        'TRANSICAO_INVALIDA',
      );
    }
  }

  private mudar(para: StatusExecucao, em: Date, detalhe?: string): void {
    this.transicoes.push({
      de: this.props.status,
      para,
      em,
      ...(detalhe ? { detalhe } : {}),
    });
    this.props.status = para;
    this.touch();
  }

  private mecanicoValido(mecanicoId: string): string {
    if (!mecanicoId || mecanicoId.trim() === '') {
      throw new DomainError('Mecânico é obrigatório', 'MECANICO_OBRIGATORIO');
    }
    return mecanicoId;
  }

  private localizarItem(itemId: string): ItemExecucao {
    const item = this.props.itens.find((x) => x.itemId === itemId);
    if (!item) {
      throw new DomainError(`Item ${itemId} não pertence à OS`, 'ITEM_NAO_ENCONTRADO');
    }
    return item;
  }
}

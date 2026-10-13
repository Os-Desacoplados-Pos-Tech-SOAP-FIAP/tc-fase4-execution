import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { OrdemExecucao, TransicaoExecucao } from '../../../domain/execucao/entities/OrdemExecucao';
import { StatusExecucao } from '../../../domain/execucao/value-objects/StatusExecucao';

class ItemExecucaoResponseDto {
  @ApiProperty() itemId!: string;
  @ApiProperty() servicoId!: string;
  @ApiProperty() descricao!: string;
  @ApiPropertyOptional() inicio?: Date;
  @ApiPropertyOptional() fim?: Date;
}

export class OrdemExecucaoResponseDto {
  @ApiProperty() osId!: string;
  @ApiPropertyOptional() numeroOs?: number;
  @ApiProperty({ enum: StatusExecucao }) status!: StatusExecucao;
  @ApiPropertyOptional() mecanicoId?: string;
  @ApiProperty({ type: ItemExecucaoResponseDto, isArray: true }) itens!: ItemExecucaoResponseDto[];
  @ApiProperty() enfileiradoEm!: Date;
  @ApiPropertyOptional() reparoIniciadoEm?: Date;
  @ApiPropertyOptional() concluidoEm?: Date;
  @ApiProperty() versao!: number;

  static fromDomain(ordem: OrdemExecucao): OrdemExecucaoResponseDto {
    return {
      osId: ordem.osId,
      numeroOs: ordem.numeroOs,
      status: ordem.status,
      mecanicoId: ordem.mecanicoId,
      itens: ordem.itens,
      enfileiradoEm: ordem.enfileiradoEm,
      reparoIniciadoEm: ordem.reparoIniciadoEm,
      concluidoEm: ordem.concluidoEm,
      versao: ordem.versao,
    };
  }
}

class TransicaoResponseDto {
  @ApiProperty({ enum: StatusExecucao, nullable: true }) de!: StatusExecucao | null;
  @ApiProperty({ enum: StatusExecucao }) para!: StatusExecucao;
  @ApiProperty() em!: Date;
  @ApiPropertyOptional() detalhe?: string;
}

export class DetalheOrdemResponseDto {
  @ApiProperty({ type: OrdemExecucaoResponseDto }) ordem!: OrdemExecucaoResponseDto;
  @ApiProperty({ type: TransicaoResponseDto, isArray: true }) historico!: TransicaoExecucao[];
}

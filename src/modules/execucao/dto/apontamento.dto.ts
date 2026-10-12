import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import {
  ACOES_APONTAMENTO,
  AcaoApontamento,
} from '../../../application/execucao/apontar-servico/ApontarServicoUseCase';

export class ApontamentoDto {
  @ApiProperty({ enum: ACOES_APONTAMENTO })
  @IsIn(ACOES_APONTAMENTO)
  acao!: AcaoApontamento;
}

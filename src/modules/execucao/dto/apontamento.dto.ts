import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { AcaoApontamento } from '../../../application/execucao/apontar-servico/ApontarServicoUseCase';

export class ApontamentoDto {
  @ApiProperty({ enum: ['INICIAR', 'FINALIZAR'] })
  @IsIn(['INICIAR', 'FINALIZAR'])
  acao!: AcaoApontamento;
}

import { ApiProperty } from '@nestjs/swagger';

export class TempoMedioPorServicoResponseDto {
  @ApiProperty() servicoId!: string;
  @ApiProperty() nome!: string;
  @ApiProperty() tempoMedioMinutos!: number;
  @ApiProperty() totalExecucoes!: number;
}

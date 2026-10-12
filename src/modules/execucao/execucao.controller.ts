import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApontarServicoUseCase } from '../../application/execucao/apontar-servico/ApontarServicoUseCase';
import { ConcluirDiagnosticoUseCase } from '../../application/execucao/concluir-diagnostico/ConcluirDiagnosticoUseCase';
import { ConcluirReparoUseCase } from '../../application/execucao/concluir-reparo/ConcluirReparoUseCase';
import { ConsultasExecucaoUseCase } from '../../application/execucao/consultas/ConsultasExecucaoUseCase';
import { IniciarDiagnosticoUseCase } from '../../application/execucao/iniciar-diagnostico/IniciarDiagnosticoUseCase';
import { IniciarReparoUseCase } from '../../application/execucao/iniciar-reparo/IniciarReparoUseCase';
import { PerfilAcesso } from '../../common/auth/perfil';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiAuthResponses, ApiValidationResponses } from '../../common/decorators/swagger';
import { StatusExecucao } from '../../domain/execucao/value-objects/StatusExecucao';
import { UsuarioAutenticado } from '../../infrastructure/auth/jwt.strategy';
import { ApontamentoDto } from './dto/apontamento.dto';
import { DetalheOrdemResponseDto, OrdemExecucaoResponseDto } from './dto/ordem-execucao-response.dto';
import { TempoMedioPorServicoResponseDto } from './dto/tempo-medio-por-servico-response.dto';

const EQUIPE = [PerfilAcesso.MECANICO, PerfilAcesso.ATENDENTE, PerfilAcesso.ADMINISTRADOR];
const uuid = new ParseUUIDPipe();

@ApiTags('Execução')
@ApiBearerAuth()
@Roles(PerfilAcesso.MECANICO)
@Controller()
export class ExecucaoController {
  constructor(
    private readonly consultas: ConsultasExecucaoUseCase,
    private readonly iniciarDiagnostico: IniciarDiagnosticoUseCase,
    private readonly concluirDiagnostico: ConcluirDiagnosticoUseCase,
    private readonly iniciarReparo: IniciarReparoUseCase,
    private readonly apontar: ApontarServicoUseCase,
    private readonly concluirReparo: ConcluirReparoUseCase,
  ) {}

  @Get('fila')
  @Roles(...EQUIPE)
  @ApiOperation({ summary: 'Fila da oficina (padrão: OS aguardando ou em diagnóstico/reparo)' })
  @ApiQuery({ name: 'status', enum: StatusExecucao, required: false })
  @ApiResponse({ status: 200, type: OrdemExecucaoResponseDto, isArray: true })
  @ApiAuthResponses()
  async fila(
    @Query('status', new ParseEnumPipe(StatusExecucao, { optional: true })) status?: StatusExecucao,
  ): Promise<OrdemExecucaoResponseDto[]> {
    return (await this.consultas.fila(status)).map((o) => OrdemExecucaoResponseDto.fromDomain(o));
  }

  @Get('ordens/:osId')
  @Roles(...EQUIPE)
  @ApiOperation({ summary: 'Situação de uma OS na oficina, com histórico' })
  @ApiResponse({ status: 200, type: DetalheOrdemResponseDto })
  @ApiResponse({ status: 404, description: 'OS não está na oficina' })
  @ApiAuthResponses()
  async detalhe(@Param('osId', uuid) osId: string): Promise<DetalheOrdemResponseDto> {
    const { ordem, historico } = await this.consultas.detalhe(osId);
    return { ordem: OrdemExecucaoResponseDto.fromDomain(ordem), historico };
  }

  @Post(':osId/diagnostico/iniciar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mecânico assume o diagnóstico' })
  @ApiResponse({ status: 200, type: OrdemExecucaoResponseDto })
  @ApiResponse({ status: 404, description: 'OS não está na oficina' })
  @ApiResponse({ status: 409, description: 'Conflito de concorrência (tente novamente)' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async postIniciarDiagnostico(
    @Param('osId', uuid) osId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<OrdemExecucaoResponseDto> {
    return OrdemExecucaoResponseDto.fromDomain(await this.iniciarDiagnostico.execute(osId, usuario.id));
  }

  @Post(':osId/diagnostico/concluir')
  @HttpCode(200)
  @ApiOperation({ summary: 'Conclui o diagnóstico (o OS Service gera o orçamento)' })
  @ApiResponse({ status: 200, type: OrdemExecucaoResponseDto })
  @ApiResponse({ status: 404, description: 'OS não está na oficina' })
  @ApiResponse({ status: 409, description: 'Conflito de concorrência (tente novamente)' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async postConcluirDiagnostico(@Param('osId', uuid) osId: string): Promise<OrdemExecucaoResponseDto> {
    return OrdemExecucaoResponseDto.fromDomain(await this.concluirDiagnostico.execute(osId));
  }

  @Post(':osId/reparo/iniciar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mecânico inicia o reparo de uma OS aceita' })
  @ApiResponse({ status: 200, type: OrdemExecucaoResponseDto })
  @ApiResponse({ status: 404, description: 'OS não está na oficina' })
  @ApiResponse({ status: 409, description: 'Conflito de concorrência (tente novamente)' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async postIniciarReparo(
    @Param('osId', uuid) osId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<OrdemExecucaoResponseDto> {
    return OrdemExecucaoResponseDto.fromDomain(await this.iniciarReparo.execute(osId, usuario.id));
  }

  @Post(':osId/itens/:itemId/apontamento')
  @HttpCode(200)
  @ApiOperation({ summary: 'Início/fim de um serviço (alimenta o tempo médio)' })
  @ApiResponse({ status: 200, type: OrdemExecucaoResponseDto })
  @ApiResponse({ status: 404, description: 'OS não está na oficina' })
  @ApiResponse({ status: 409, description: 'Conflito de concorrência (tente novamente)' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async postApontamento(
    @Param('osId', uuid) osId: string,
    @Param('itemId', uuid) itemId: string,
    @Body() dto: ApontamentoDto,
  ): Promise<OrdemExecucaoResponseDto> {
    return OrdemExecucaoResponseDto.fromDomain(await this.apontar.execute(osId, itemId, dto.acao));
  }

  @Post(':osId/reparo/concluir')
  @HttpCode(200)
  @ApiOperation({ summary: 'Conclui o reparo e libera a vaga na oficina' })
  @ApiResponse({ status: 200, type: OrdemExecucaoResponseDto })
  @ApiResponse({ status: 404, description: 'OS não está na oficina' })
  @ApiResponse({ status: 409, description: 'Conflito de concorrência (tente novamente)' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async postConcluirReparo(@Param('osId', uuid) osId: string): Promise<OrdemExecucaoResponseDto> {
    return OrdemExecucaoResponseDto.fromDomain(await this.concluirReparo.execute(osId));
  }

  @Get('metricas/tempo-medio')
  @Roles(PerfilAcesso.ADMINISTRADOR)
  @ApiOperation({ summary: 'Tempo médio de reparo (minutos)' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { tempoMedioMinutos: { type: 'number' } } } })
  @ApiAuthResponses()
  tempoMedio(): Promise<{ tempoMedioMinutos: number }> {
    return this.consultas.tempoMedio();
  }

  @Get('metricas/tempo-medio-por-servico')
  @Roles(PerfilAcesso.ADMINISTRADOR)
  @ApiOperation({ summary: 'Tempo médio por tipo de serviço (minutos)' })
  @ApiResponse({ status: 200, type: TempoMedioPorServicoResponseDto, isArray: true })
  @ApiAuthResponses()
  tempoMedioPorServico(): Promise<TempoMedioPorServicoResponseDto[]> {
    return this.consultas.tempoMedioPorServico();
  }
}

import { Module } from '@nestjs/common';

import { ApontarServicoUseCase } from '../../application/execucao/apontar-servico/ApontarServicoUseCase';
import { ConcluirDiagnosticoUseCase } from '../../application/execucao/concluir-diagnostico/ConcluirDiagnosticoUseCase';
import { ConcluirReparoUseCase } from '../../application/execucao/concluir-reparo/ConcluirReparoUseCase';
import { ConsultasExecucaoUseCase } from '../../application/execucao/consultas/ConsultasExecucaoUseCase';
import { EnfileirarDiagnosticoUseCase } from '../../application/execucao/enfileirar-diagnostico/EnfileirarDiagnosticoUseCase';
import { EnfileirarExecucaoUseCase } from '../../application/execucao/enfileirar-execucao/EnfileirarExecucaoUseCase';
import { IniciarDiagnosticoUseCase } from '../../application/execucao/iniciar-diagnostico/IniciarDiagnosticoUseCase';
import { IniciarReparoUseCase } from '../../application/execucao/iniciar-reparo/IniciarReparoUseCase';
import { ReabrirDiagnosticoUseCase } from '../../application/execucao/reabrir-diagnostico/ReabrirDiagnosticoUseCase';
import { ExecucaoController } from './execucao.controller';
import { ExecutionMessageHandlers } from './execution-message.handlers';

@Module({
  controllers: [ExecucaoController],
  providers: [
    ConsultasExecucaoUseCase,
    IniciarDiagnosticoUseCase,
    ConcluirDiagnosticoUseCase,
    IniciarReparoUseCase,
    ApontarServicoUseCase,
    ConcluirReparoUseCase,
    EnfileirarDiagnosticoUseCase,
    ReabrirDiagnosticoUseCase,
    EnfileirarExecucaoUseCase,
    ExecutionMessageHandlers,
  ],
})
export class ExecucaoModule {}

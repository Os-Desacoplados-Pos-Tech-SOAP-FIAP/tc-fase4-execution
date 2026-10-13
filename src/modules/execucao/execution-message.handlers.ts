import { Injectable, OnModuleInit } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';

import { EnfileirarDiagnosticoUseCase } from '../../application/execucao/enfileirar-diagnostico/EnfileirarDiagnosticoUseCase';
import { EnfileirarExecucaoUseCase } from '../../application/execucao/enfileirar-execucao/EnfileirarExecucaoUseCase';
import { EXECUTION_COMMANDS } from '../../application/execucao/execution-messages';
import { ReabrirDiagnosticoUseCase } from '../../application/execucao/reabrir-diagnostico/ReabrirDiagnosticoUseCase';
import { MessageHandlerRegistry } from '../../infrastructure/messaging/message-handler.registry';
import { validarPayload } from '../../infrastructure/messaging/validar-payload';

class EnfileirarDiagnosticoMensagem {
  @IsOptional() @IsInt() @Min(1) numeroOs?: number;
}

class ItemExecucaoMensagem {
  @IsUUID() itemId!: string;
  @IsUUID() servicoId!: string;
  @IsString() @MinLength(1) descricao!: string;
}

class EnfileirarExecucaoMensagem {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemExecucaoMensagem)
  itens!: ItemExecucaoMensagem[];
}

/** Liga os comandos da fila de entrada aos casos de uso. */
@Injectable()
export class ExecutionMessageHandlers implements OnModuleInit {
  constructor(
    private readonly registry: MessageHandlerRegistry,
    private readonly enfileirarDiagnostico: EnfileirarDiagnosticoUseCase,
    private readonly reabrirDiagnostico: ReabrirDiagnosticoUseCase,
    private readonly enfileirarExecucao: EnfileirarExecucaoUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.registrar(EXECUTION_COMMANDS.ENFILEIRAR_DIAGNOSTICO, async (envelope) => {
      const payload = await validarPayload(EnfileirarDiagnosticoMensagem, envelope.payload);
      await this.enfileirarDiagnostico.execute({
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        numeroOs: payload.numeroOs,
      });
    });
    this.registry.registrar(EXECUTION_COMMANDS.REABRIR_DIAGNOSTICO, (envelope) =>
      this.reabrirDiagnostico.execute({ messageId: envelope.messageId, correlationId: envelope.correlationId }),
    );
    this.registry.registrar(EXECUTION_COMMANDS.ENFILEIRAR_EXECUCAO, async (envelope) => {
      const payload = await validarPayload(EnfileirarExecucaoMensagem, envelope.payload);
      await this.enfileirarExecucao.execute({
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        itens: payload.itens,
      });
    });
  }
}

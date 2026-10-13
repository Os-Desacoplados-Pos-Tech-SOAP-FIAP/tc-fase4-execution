import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiValidationResponses() {
  return applyDecorators(
    ApiResponse({ status: 400, description: 'Payload inválido (falha de validação do DTO)' }),
    ApiResponse({ status: 422, description: 'Violação de invariante de domínio' }),
  );
}

import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiAuthResponses() {
  return applyDecorators(
    ApiResponse({ status: 401, description: 'Não autenticado (JWT ausente ou inválido)' }),
    ApiResponse({ status: 403, description: 'Perfil sem permissão para acessar o recurso' }),
  );
}

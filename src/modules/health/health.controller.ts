import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';

/**
 * Endpoint enxuto para liveness/readiness probes do Kubernetes e HEALTHCHECK
 * do Docker. Propositalmente público (sem JWT) e sem dependência de banco, para
 * que o `livenessProbe` não derrube o Pod quando o DB estiver indisponível.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Health check da API',
    description:
      'Retorna 200 sem autenticação. Usado pelos probes do K8s e pelo HEALTHCHECK do Docker.',
  })
  @ApiResponse({ status: 200, description: 'API no ar.' })
  check(): { status: string } {
    return { status: 'ok' };
  }
}

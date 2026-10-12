import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('retorna { status: "ok" }', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });

  it('está marcado como público (escapa do JwtAuthGuard)', () => {
    const isPublic = new Reflector().get<boolean>(
      IS_PUBLIC_KEY,
      controller.check,
    );
    expect(isPublic).toBe(true);
  });
});

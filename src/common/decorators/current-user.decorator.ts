import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { UsuarioAutenticado } from '../../infrastructure/auth/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

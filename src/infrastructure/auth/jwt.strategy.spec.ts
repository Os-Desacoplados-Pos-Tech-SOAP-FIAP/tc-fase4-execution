import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PerfilAcesso } from '../../common/auth/perfil';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy(new ConfigService({ JWT_SECRET: 'segredo' }));

  it('aceita qualquer perfil do token único, sem consultar banco', () => {
    expect(strategy.validate({ sub: 'u1', perfil: PerfilAcesso.MECANICO, email: 'm@x.com' })).toEqual({
      id: 'u1',
      perfil: PerfilAcesso.MECANICO,
      email: 'm@x.com',
    });
  });

  it.each([
    [{ sub: '', perfil: PerfilAcesso.ADMINISTRADOR }],
    [{ sub: 'u1', perfil: 'HACKER' }],
  ])('rejeita payload inválido %p', (payload) => {
    expect(() => strategy.validate(payload as never)).toThrow(UnauthorizedException);
  });
});

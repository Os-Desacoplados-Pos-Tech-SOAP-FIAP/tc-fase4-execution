import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PerfilAcesso } from '../../common/auth/perfil';

export interface JwtPayload {
  sub: string;
  perfil: PerfilAcesso;
  email?: string;
}

export interface UsuarioAutenticado {
  id: string;
  perfil: PerfilAcesso;
  email?: string;
}

/**
 * Valida o JWT único da Fase 4 só pela assinatura e pelas claims: este serviço não tem
 * tabela de usuários (quem emite o token é o OS Service ou a Lambda de CPF).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): UsuarioAutenticado {
    const perfilValido = Object.values(PerfilAcesso).includes(payload?.perfil);
    if (!payload?.sub || !perfilValido) {
      throw new UnauthorizedException('Token sem usuário ou perfil válido');
    }
    return { id: payload.sub, perfil: payload.perfil, email: payload.email };
  }
}

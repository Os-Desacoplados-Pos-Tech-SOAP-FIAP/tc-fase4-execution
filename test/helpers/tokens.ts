import { sign } from 'jsonwebtoken';

import { PerfilAcesso } from '../../src/common/auth/perfil';

export function token(perfil: PerfilAcesso, sub = 'usuario-teste'): string {
  return `Bearer ${sign({ sub, perfil }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
}

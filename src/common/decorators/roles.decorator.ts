import { SetMetadata } from '@nestjs/common';
import { PerfilAcesso } from '../auth/perfil';

export const ROLES_KEY = 'roles';
export const Roles = (...perfis: PerfilAcesso[]) => SetMetadata(ROLES_KEY, perfis);

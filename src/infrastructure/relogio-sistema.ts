import { IRelogio } from '../application/ports/relogio';

export const relogioSistema: IRelogio = { agora: () => new Date() };

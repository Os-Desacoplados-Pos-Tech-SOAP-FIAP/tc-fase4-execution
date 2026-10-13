import { IRelogio } from '../../src/application/ports/relogio';

export class RelogioFixo implements IRelogio {
  constructor(private atual = new Date(Date.UTC(2026, 9, 20, 10, 0))) {}
  agora(): Date {
    return new Date(this.atual);
  }
  avancarMinutos(minutos: number): void {
    this.atual = new Date(this.atual.getTime() + minutos * 60_000);
  }
}

import { intervaloExportacaoMetricas } from './intervalo-exportacao';

describe('intervaloExportacaoMetricas', () => {
  it('usa OTEL_METRIC_EXPORT_INTERVAL quando é um número positivo', () => {
    expect(intervaloExportacaoMetricas({ OTEL_METRIC_EXPORT_INTERVAL: '10000' })).toBe(10_000);
  });

  it('sem a variável, usa o padrão de 60 s', () => {
    expect(intervaloExportacaoMetricas({})).toBe(60_000);
  });

  it.each(['', '0', '-5', 'abc', '10s', 'Infinity'])('valor inválido %p cai no padrão', (valor) => {
    expect(intervaloExportacaoMetricas({ OTEL_METRIC_EXPORT_INTERVAL: valor })).toBe(60_000);
  });
});

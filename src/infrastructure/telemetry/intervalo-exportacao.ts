/** Mesmo padrão do PeriodicExportingMetricReader do sdk-metrics. */
const INTERVALO_PADRAO_MS = 60_000;

/**
 * Intervalo de exportação das métricas. O NodeSDK só lê OTEL_METRIC_EXPORT_INTERVAL quando
 * cria o reader sozinho; com o reader explícito do tracing.ts, o valor precisa ser repassado.
 * Valor ausente ou inválido (não numérico, zero ou negativo) cai no padrão.
 */
export function intervaloExportacaoMetricas(env: NodeJS.ProcessEnv): number {
  const valor = Number(env.OTEL_METRIC_EXPORT_INTERVAL);
  return Number.isFinite(valor) && valor > 0 ? valor : INTERVALO_PADRAO_MS;
}

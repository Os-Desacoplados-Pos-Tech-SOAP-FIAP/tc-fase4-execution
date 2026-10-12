// Bootstrap do OpenTelemetry. DEVE ser o primeiro import do main.ts: a
// auto-instrumentação faz patch de http/express/pg no momento do require.
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Sem OTEL_EXPORTER_OTLP_ENDPOINT (dev local e testes) o SDK nem inicia — a app
// roda normalmente, apenas sem telemetria. Em produção o endpoint aponta para o
// Grafana Alloy no cluster, que encaminha para o Grafana Cloud.
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'tc-fase4-execution',
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  console.log(`[otel] exportando traces e métricas via OTLP para ${endpoint}`);

  process.on('SIGTERM', () => {
    void sdk.shutdown();
  });
}

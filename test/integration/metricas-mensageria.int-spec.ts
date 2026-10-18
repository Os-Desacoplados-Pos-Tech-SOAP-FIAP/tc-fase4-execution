import { SQSClient } from '@aws-sdk/client-sqs';
import { metrics } from '@opentelemetry/api';
import { AggregationTemporality, MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';

import { criarEnvelope } from '../../src/application/ports/message-envelope';
import { lerDynamoConfig } from '../../src/infrastructure/dynamo/dynamo.config';
import { DynamoUnitOfWork } from '../../src/infrastructure/dynamo/dynamo-unit-of-work';
import { lerMessagingConfig } from '../../src/infrastructure/messaging/messaging.config';
import { OutboxLease } from '../../src/infrastructure/messaging/outbox-lease';
import { DynamoOutbox } from '../../src/infrastructure/repositories/DynamoOutbox';
import { GaugesMensageria } from '../../src/infrastructure/telemetry/metricas-mensageria';
import { documentoTeste } from '../helpers/dynamo';
import { limparTabela } from '../helpers/limpar-tabela';

class LeitorDeTeste extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE });
  }
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe('GaugesMensageria (integração)', () => {
  const doc = documentoTeste();
  const dynamo = lerDynamoConfig(process.env);
  const mensageria = lerMessagingConfig({ EVENTS_TOPIC_ARN: 'arn:aws:sns:us-east-1:1:t.fifo' });
  const uow = new DynamoUnitOfWork(doc);
  const outbox = new DynamoOutbox(uow, dynamo, mensageria);
  let leitor: LeitorDeTeste;
  let provider: MeterProvider;

  beforeEach(async () => {
    await limparTabela(doc);
    leitor = new LeitorDeTeste();
    provider = new MeterProvider({ readers: [leitor] });
    metrics.setGlobalMeterProvider(provider);
  });
  afterEach(async () => {
    metrics.disable();
    await provider.shutdown();
  });

  const gravar = (osId: string, versao: number) =>
    uow.run(async () => {
      uow.registrarVersao(osId, versao);
      await outbox.publicar(criarEnvelope('t.a', osId, {}));
    });

  it('outbox_pendentes conta só a partição OUTBOX (o lease e as ordens ficam de fora)', async () => {
    await gravar('os-1', 1);
    await gravar('os-1', 2);
    await gravar('os-2', 1);
    expect(await new OutboxLease(doc, dynamo).adquirir()).toBe(true);

    new GaugesMensageria(doc, dynamo, new SQSClient({}), mensageria).onModuleInit();
    const { resourceMetrics, errors } = await leitor.collect();

    expect(errors).toEqual([]);
    const pendentes = resourceMetrics.scopeMetrics
      .flatMap((s) => s.metrics)
      .find((m) => m.descriptor.name === 'outbox_pendentes');
    expect(pendentes?.dataPoints.map((p) => p.value)).toEqual([3]);
  });
});

import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import { processarNoContexto, publicarNoContexto } from './contexto-mensagem';

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const SPAN_PAI = 'b7ad6b7169203331';
const TRACEPARENT = `00-${TRACE_ID}-${SPAN_PAI}-01`;

describe('contexto-mensagem', () => {
  const exporter = new InMemorySpanExporter();

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
    );
  });
  afterEach(() => exporter.reset());
  afterAll(() => {
    trace.disable();
    propagation.disable();
    context.disable();
  });

  const info = { type: 'catalog.reservar-insumos.v1', messageId: 'm-1', osId: 'os-1' };
  const unicoSpan = () => {
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    return spans[0];
  };

  describe('processarNoContexto', () => {
    it('continua o trace do traceparent recebido num span CONSUMER ativo durante o processamento', async () => {
      let ativo: string | undefined;
      const resultado = await processarNoContexto(
        { traceparent: { DataType: 'String', StringValue: TRACEPARENT } },
        info,
        async () => {
          ativo = trace.getActiveSpan()?.spanContext().spanId;
          return 'ok';
        },
      );

      const span = unicoSpan();
      expect(resultado).toBe('ok');
      expect(span.name).toBe('process catalog.reservar-insumos.v1');
      expect(span.kind).toBe(SpanKind.CONSUMER);
      expect(span.spanContext().traceId).toBe(TRACE_ID);
      expect(span.parentSpanContext?.spanId).toBe(SPAN_PAI);
      expect(ativo).toBe(span.spanContext().spanId);
      expect(span.attributes).toEqual({
        'messaging.system': 'aws_sqs',
        'messaging.message.id': 'm-1',
        'oficina.os_id': 'os-1',
        'oficina.message_type': 'catalog.reservar-insumos.v1',
      });
    });

    it('sem traceparent abre um span raiz novo', async () => {
      await processarNoContexto(undefined, {}, async () => undefined);

      const span = unicoSpan();
      expect(span.name).toBe('process desconhecido');
      expect(span.parentSpanContext).toBeUndefined();
      expect(span.spanContext().traceId).not.toBe(TRACE_ID);
      expect(span.attributes).toEqual({ 'messaging.system': 'aws_sqs' });
    });

    it('traceparent inválido também vira span raiz, sem lançar', async () => {
      await processarNoContexto(
        { traceparent: { DataType: 'String', StringValue: 'lixo' } },
        info,
        async () => undefined,
      );
      expect(unicoSpan().parentSpanContext).toBeUndefined();
    });

    it('falha marca o span com ERROR, registra a exceção, encerra o span e repropaga', async () => {
      const erro = new Error('boom');
      await expect(
        processarNoContexto(undefined, info, async () => {
          throw erro;
        }),
      ).rejects.toBe(erro);

      const span = unicoSpan();
      expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'boom' });
      expect(span.events.map((e) => e.name)).toEqual(['exception']);
      expect(span.ended).toBe(true);
    });
  });

  describe('publicarNoContexto', () => {
    it('publica num span PRODUCER filho do traceparent gravado na outbox', async () => {
      let ativo: string | undefined;
      await publicarNoContexto(TRACEPARENT, info, async () => {
        ativo = trace.getActiveSpan()?.spanContext().spanId;
      });

      const span = unicoSpan();
      expect(span.name).toBe('publish catalog.reservar-insumos.v1');
      expect(span.kind).toBe(SpanKind.PRODUCER);
      expect(span.spanContext().traceId).toBe(TRACE_ID);
      expect(span.parentSpanContext?.spanId).toBe(SPAN_PAI);
      expect(ativo).toBe(span.spanContext().spanId);
    });

    it('sem traceparent gravado publica num span raiz', async () => {
      await publicarNoContexto(null, info, async () => undefined);
      expect(unicoSpan().parentSpanContext).toBeUndefined();
    });
  });
});

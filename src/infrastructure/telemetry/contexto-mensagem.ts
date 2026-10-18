import type { MessageAttributeValue } from '@aws-sdk/client-sqs';
import {
  type Attributes,
  context,
  type Context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

// ProxyTracer: resolve o provider global no uso, então funciona mesmo importado antes do SDK.
const tracer = trace.getTracer('oficina-mensageria');

const TIPO_DESCONHECIDO = 'desconhecido';

/** Identificação da mensagem nos spans (e nos logs de quem chama). */
export interface InfoMensagem {
  type?: string;
  messageId?: string;
  osId?: string;
}

function contextoDoTraceparent(traceparent: string | null | undefined): Context {
  return traceparent ? propagation.extract(ROOT_CONTEXT, { traceparent }) : ROOT_CONTEXT;
}

function atributos(info: InfoMensagem): Attributes {
  return {
    'messaging.system': 'aws_sqs',
    ...(info.messageId && { 'messaging.message.id': info.messageId }),
    ...(info.osId && { 'oficina.os_id': info.osId }),
    ...(info.type && { 'oficina.message_type': info.type }),
  };
}

async function emSpan<T>(
  nome: string,
  kind: SpanKind,
  pai: Context,
  info: InfoMensagem,
  fn: () => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(nome, { kind, attributes: atributos(info) }, pai);
  try {
    return await context.with(trace.setSpan(pai, span), fn);
  } catch (erro) {
    span.recordException(erro as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (erro as Error).message });
    throw erro;
  } finally {
    span.end();
  }
}

/**
 * Continua no consumidor o trace iniciado no serviço que publicou (traceparent nos
 * atributos da mensagem). Tudo o que `fn` gravar na outbox herda este contexto, o que
 * encadeia o próximo salto da saga. Sem traceparent válido, abre um trace novo.
 */
export function processarNoContexto<T>(
  atributosMensagem: Record<string, MessageAttributeValue> | undefined,
  info: InfoMensagem,
  fn: () => Promise<T>,
): Promise<T> {
  const pai = contextoDoTraceparent(atributosMensagem?.traceparent?.StringValue);
  return emSpan(`process ${info.type ?? TIPO_DESCONHECIDO}`, SpanKind.CONSUMER, pai, info, fn);
}

/**
 * Publica a mensagem da outbox dentro do trace da requisição/mensagem que a gravou: o
 * publicador roda num timer, fora daquele contexto.
 */
export function publicarNoContexto<T>(
  traceparent: string | null,
  info: InfoMensagem,
  fn: () => Promise<T>,
): Promise<T> {
  const pai = contextoDoTraceparent(traceparent);
  return emSpan(`publish ${info.type ?? TIPO_DESCONHECIDO}`, SpanKind.PRODUCER, pai, info, fn);
}

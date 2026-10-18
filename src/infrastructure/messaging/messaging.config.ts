export const MESSAGING_CONFIG = Symbol('MessagingConfig');

export interface MessagingConfig {
  enabled: boolean;
  region: string;
  /** Só em dev (LocalStack). Na AWS fica indefinido. */
  endpoint?: string;
  inboxQueueUrl: string;
  eventsTopicArn: string;
  /** DLQ da fila de entrada, só para a métrica dlq_mensagens (opcional). */
  dlqQueueUrl?: string;
}

export function lerMessagingConfig(env: NodeJS.ProcessEnv): MessagingConfig {
  return {
    enabled: env.MESSAGING_ENABLED !== 'false',
    region: env.AWS_REGION ?? 'us-east-1',
    endpoint: env.AWS_ENDPOINT_URL || undefined,
    inboxQueueUrl: env.INBOX_QUEUE_URL ?? '',
    eventsTopicArn: env.EVENTS_TOPIC_ARN ?? '',
    dlqQueueUrl: env.DLQ_QUEUE_URL || undefined,
  };
}

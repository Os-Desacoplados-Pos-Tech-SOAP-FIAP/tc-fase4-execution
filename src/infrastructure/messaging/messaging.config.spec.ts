import { lerMessagingConfig } from './messaging.config';

describe('lerMessagingConfig', () => {
  it('lê as variáveis do ambiente', () => {
    expect(
      lerMessagingConfig({
        MESSAGING_ENABLED: 'true',
        AWS_REGION: 'sa-east-1',
        AWS_ENDPOINT_URL: 'http://localhost:4566',
        INBOX_QUEUE_URL: 'url-fila',
        EVENTS_TOPIC_ARN: 'arn-topico',
      }),
    ).toEqual({
      enabled: true,
      region: 'sa-east-1',
      endpoint: 'http://localhost:4566',
      inboxQueueUrl: 'url-fila',
      eventsTopicArn: 'arn-topico',
    });
  });

  it('aplica padrões: habilitado, us-east-1 e sem endpoint customizado', () => {
    expect(lerMessagingConfig({})).toEqual({
      enabled: true,
      region: 'us-east-1',
      endpoint: undefined,
      inboxQueueUrl: '',
      eventsTopicArn: '',
    });
  });

  it('desliga com MESSAGING_ENABLED=false', () => {
    expect(lerMessagingConfig({ MESSAGING_ENABLED: 'false' }).enabled).toBe(false);
  });
});

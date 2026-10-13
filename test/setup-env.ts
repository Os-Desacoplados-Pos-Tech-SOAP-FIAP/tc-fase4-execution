import 'reflect-metadata';

process.env.AWS_ENDPOINT_URL ??= 'http://localhost:4566';
process.env.AWS_REGION ??= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.DYNAMO_TABLE = 'oficina-execution-test';
process.env.JWT_SECRET ??= 'segredo-de-teste';
process.env.MESSAGING_ENABLED = 'false';
process.env.EXECUTION_MAX_CONCURRENT ??= '2';
process.env.EVENTS_TOPIC_ARN ??= 'arn:aws:sns:us-east-1:000000000000:oficina-execution-events.fifo';
process.env.INBOX_QUEUE_URL ??= 'http://localhost:4566/000000000000/oficina-execution-inbox.fifo';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Global, Module } from '@nestjs/common';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { DYNAMO_CONFIG, DynamoConfig, lerDynamoConfig } from './dynamo.config';
import { DynamoUnitOfWork } from './dynamo-unit-of-work';

@Global()
@Module({
  providers: [
    { provide: DYNAMO_CONFIG, useFactory: () => lerDynamoConfig(process.env) },
    {
      provide: DynamoDBDocumentClient,
      inject: [DYNAMO_CONFIG],
      useFactory: (config: DynamoConfig) =>
        DynamoDBDocumentClient.from(
          new DynamoDBClient({
            region: config.region,
            endpoint: config.endpoint,
            maxAttempts: 3,
            requestHandler: new NodeHttpHandler({ requestTimeout: 3000, connectionTimeout: 2000 }),
          }),
          { marshallOptions: { removeUndefinedValues: true } },
        ),
    },
    DynamoUnitOfWork,
  ],
  exports: [DYNAMO_CONFIG, DynamoDBDocumentClient, DynamoUnitOfWork],
})
export class DynamoModule {}

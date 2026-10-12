import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';

export const TABELA_TESTE = 'oficina-execution-test';

export function clienteDynamoTeste(): DynamoDBClient {
  return new DynamoDBClient({
    region: 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
}

/** Recria a tabela de teste do zero (mesmo esquema da AWS). */
export async function recriarTabela(cliente: DynamoDBClient, tabela = TABELA_TESTE): Promise<void> {
  try {
    await cliente.send(new DeleteTableCommand({ TableName: tabela }));
  } catch (erro) {
    if (!(erro instanceof ResourceNotFoundException)) throw erro;
  }
  await cliente.send(
    new CreateTableCommand({
      TableName: tabela,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    }),
  );
  await waitUntilTableExists({ client: cliente, maxWaitTime: 30 }, { TableName: tabela });
}

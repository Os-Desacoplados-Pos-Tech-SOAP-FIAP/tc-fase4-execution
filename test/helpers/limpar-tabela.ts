import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

import { TABELA_TESTE } from './dynamo';

/** Remove todos os itens da tabela de teste (recriar a tabela é lento no LocalStack). */
export async function limparTabela(doc: DynamoDBDocumentClient, tabela = TABELA_TESTE): Promise<void> {
  let inicio: Record<string, unknown> | undefined;
  do {
    const pagina = await doc.send(
      new ScanCommand({ TableName: tabela, ProjectionExpression: 'PK, SK', ExclusiveStartKey: inicio }),
    );
    const chaves = pagina.Items ?? [];
    for (let i = 0; i < chaves.length; i += 25) {
      await doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [tabela]: chaves.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })),
          },
        }),
      );
    }
    inicio = pagina.LastEvaluatedKey;
  } while (inicio);
}

import { clienteDynamoTeste, recriarTabela } from './helpers/dynamo';

export default async function globalSetup(): Promise<void> {
  process.env.AWS_ENDPOINT_URL ??= 'http://localhost:4566';
  await recriarTabela(clienteDynamoTeste());
}

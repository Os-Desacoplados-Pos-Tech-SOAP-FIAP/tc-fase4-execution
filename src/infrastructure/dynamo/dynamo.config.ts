export const DYNAMO_CONFIG = Symbol('DynamoConfig');

export interface DynamoConfig {
  tabela: string;
  region: string;
  /** Só em dev (LocalStack). Na AWS fica indefinido. */
  endpoint?: string;
}

export function lerDynamoConfig(env: NodeJS.ProcessEnv): DynamoConfig {
  return {
    tabela: env.DYNAMO_TABLE ?? '',
    region: env.AWS_REGION ?? 'us-east-1',
    endpoint: env.AWS_ENDPOINT_URL || undefined,
  };
}

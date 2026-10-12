import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { INJECTION_TOKENS } from '../common/constants/injection-tokens';
import { DYNAMO_CONFIG } from './dynamo/dynamo.config';
import { InfrastructureModule } from './infrastructure.module';

@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: { getOrThrow: () => 'segredo-teste' } }],
  exports: [ConfigService],
})
class ConfigFalsoModule {}

describe('InfrastructureModule', () => {
  let modulo: TestingModule;

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [ConfigFalsoModule, InfrastructureModule] })
      .overrideProvider(DynamoDBDocumentClient)
      .useValue({})
      .overrideProvider(DYNAMO_CONFIG)
      .useValue({ tabela: 'tabela-teste' })
      .compile();
  });
  afterAll(() => modulo.close());

  it.each(Object.entries(INJECTION_TOKENS))('resolve %s', (_nome, token) => {
    expect(modulo.get(token)).toBeDefined();
  });
});

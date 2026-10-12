import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { ConcorrenciaError } from '../../src/infrastructure/dynamo/concorrencia.error';
import { DynamoUnitOfWork } from '../../src/infrastructure/dynamo/dynamo-unit-of-work';
import { documentoTeste, TABELA_TESTE } from '../helpers/dynamo';
import { limparTabela } from '../helpers/limpar-tabela';

describe('DynamoUnitOfWork (integração)', () => {
  const doc = documentoTeste();
  const uow = new DynamoUnitOfWork(doc);
  const ler = (PK: string) =>
    doc.send(new GetCommand({ TableName: TABELA_TESTE, Key: { PK, SK: 'X' }, ConsistentRead: true }));
  const put = (PK: string, condicao?: string) =>
    uow.adicionar({
      Put: {
        TableName: TABELA_TESTE,
        Item: { PK, SK: 'X' },
        ...(condicao ? { ConditionExpression: condicao } : {}),
      },
    });

  beforeEach(() => limparTabela(doc));

  it('grava todas as escritas juntas no fim do run', async () => {
    await uow.run(async () => {
      put('A');
      put('B');
      expect((await ler('A')).Item).toBeUndefined(); // ainda não gravou
    });
    expect((await ler('A')).Item).toBeDefined();
    expect((await ler('B')).Item).toBeDefined();
  });

  it('se o trabalho lança, nada é gravado', async () => {
    await expect(
      uow.run(async () => {
        put('A');
        throw new Error('falhou');
      }),
    ).rejects.toThrow('falhou');
    expect((await ler('A')).Item).toBeUndefined();
  });

  it('condição violada desfaz a transação inteira e vira ConcorrenciaError', async () => {
    await uow.run(async () => put('A'));
    await expect(
      uow.run(async () => {
        put('B');
        put('A', 'attribute_not_exists(PK)');
      }),
    ).rejects.toBeInstanceOf(ConcorrenciaError);
    expect((await ler('B')).Item).toBeUndefined();
  });

  it('run aninhado participa da transação externa', async () => {
    await expect(
      uow.run(async () => {
        await uow.run(async () => put('A'));
        throw new Error('externa falhou');
      }),
    ).rejects.toThrow();
    expect((await ler('A')).Item).toBeUndefined();
  });

  it('escrita fora de run é erro de programação', () => {
    expect(() => put('A')).toThrow('fora de ITransactionManager.run');
  });

  it('controla versão e índice da outbox por grupo dentro da transação', async () => {
    await uow.run(async () => {
      expect(uow.versaoDe('os-1')).toBe(0);
      uow.registrarVersao('os-1', 4);
      expect(uow.versaoDe('os-1')).toBe(4);
      expect(uow.proximoIndice('os-1')).toBe(0);
      expect(uow.proximoIndice('os-1')).toBe(1);
    });
  });
});

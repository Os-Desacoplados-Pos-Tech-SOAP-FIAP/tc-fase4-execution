import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { criarEnvelope } from '../../src/application/ports/message-envelope';
import { EXECUTION_COMMANDS, EXECUTION_EVENTS } from '../../src/application/execucao/execution-messages';
import { PerfilAcesso } from '../../src/common/auth/perfil';
import { MensagemInvalidaError } from '../../src/infrastructure/messaging/message-envelope.parser';
import { MessageHandlerRegistry } from '../../src/infrastructure/messaging/message-handler.registry';
import { criarApp } from '../helpers/app';
import { TABELA_TESTE } from '../helpers/dynamo';
import { limparTabela } from '../helpers/limpar-tabela';
import { token } from '../helpers/tokens';

const OS_1 = '7f2b2a8e-1d7c-4a35-9c1e-0a4f3b2c1d10';
const OS_2 = '8a3c3b9f-2e8d-4b46-8d2f-1b5a4c3d2e21';
const OS_3 = '9b4d4c0a-3f9e-4c57-9e3a-2c6b5d4e3f32';
const ITEM = 'c1000000-0000-4000-8000-000000000001';
const SERVICO = 'a1000000-0000-4000-8000-000000000001';

describe('Execution (e2e)', () => {
  let app: INestApplication;
  let registry: MessageHandlerRegistry;
  let doc: DynamoDBDocumentClient;
  const mecanico = token(PerfilAcesso.MECANICO, 'mec-1');
  const admin = token(PerfilAcesso.ADMINISTRADOR);
  const atendente = token(PerfilAcesso.ATENDENTE);
  const cliente = token(PerfilAcesso.CLIENTE);
  const http = () => request(app.getHttpServer());
  const base = '/api/execution';

  beforeAll(async () => {
    app = await criarApp();
    registry = app.get(MessageHandlerRegistry);
    doc = app.get(DynamoDBDocumentClient);
  });
  beforeEach(() => limparTabela(doc));
  afterAll(() => app.close());

  const tiposNaOutbox = async (osId: string) =>
    ((await doc.send(new QueryCommand({
      TableName: TABELA_TESTE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :os)',
      ExpressionAttributeValues: { ':pk': 'OUTBOX', ':os': `${osId}#` },
    }))).Items ?? []).map((i) => i.type);

  const ateDiagnosticoConcluido = async (osId: string) => {
    await registry.despachar(criarEnvelope(EXECUTION_COMMANDS.ENFILEIRAR_DIAGNOSTICO, osId, { numeroOs: 7 }));
    await http().post(`${base}/${osId}/diagnostico/iniciar`).set('Authorization', mecanico).expect(200);
    await http().post(`${base}/${osId}/diagnostico/concluir`).set('Authorization', mecanico).expect(200);
  };
  const enfileirarExecucao = (osId: string) =>
    registry.despachar(
      criarEnvelope(EXECUTION_COMMANDS.ENFILEIRAR_EXECUCAO, osId, {
        itens: [{ itemId: ITEM, servicoId: SERVICO, descricao: 'Troca de óleo' }],
      }),
    );

  it('fluxo completo: fila → diagnóstico → aceite → reparo → apontamento → conclusão → métricas', async () => {
    await ateDiagnosticoConcluido(OS_1);
    await enfileirarExecucao(OS_1);

    await http().get(`${base}/fila`).set('Authorization', atendente).expect(200)
      .expect((res) => expect(res.body.map((o: { osId: string }) => o.osId)).toEqual([OS_1]));
    await http().post(`${base}/${OS_1}/reparo/iniciar`).set('Authorization', mecanico).expect(200);
    await http().post(`${base}/${OS_1}/itens/${ITEM}/apontamento`).set('Authorization', mecanico)
      .send({ acao: 'INICIAR' }).expect(200);
    await http().post(`${base}/${OS_1}/itens/${ITEM}/apontamento`).set('Authorization', mecanico)
      .send({ acao: 'FINALIZAR' }).expect(200);
    await http().post(`${base}/${OS_1}/reparo/concluir`).set('Authorization', mecanico).expect(200)
      .expect((res) => expect(res.body.status).toBe('CONCLUIDA'));

    expect(await tiposNaOutbox(OS_1)).toEqual([
      EXECUTION_EVENTS.DIAGNOSTICO_INICIADO,
      EXECUTION_EVENTS.DIAGNOSTICO_CONCLUIDO,
      EXECUTION_EVENTS.EXECUCAO_ACEITA,
      EXECUTION_EVENTS.REPARO_INICIADO,
      EXECUTION_EVENTS.SERVICO_EXECUTADO,
      EXECUTION_EVENTS.EXECUCAO_CONCLUIDA,
    ]);
    await http().get(`${base}/ordens/${OS_1}`).set('Authorization', mecanico).expect(200)
      .expect((res) => expect(res.body.historico).toHaveLength(6));
    await http().get(`${base}/metricas/tempo-medio-por-servico`).set('Authorization', admin).expect(200)
      .expect((res) => expect(res.body[0]).toMatchObject({ servicoId: SERVICO, totalExecucoes: 1 }));
    await http().get(`${base}/metricas/tempo-medio`).set('Authorization', admin).expect(200);
  });

  it('pivô recusa quando a oficina está cheia (EXECUTION_MAX_CONCURRENT=2)', async () => {
    for (const os of [OS_1, OS_2, OS_3]) {
      await ateDiagnosticoConcluido(os);
      await enfileirarExecucao(os);
    }
    expect(await tiposNaOutbox(OS_3)).toContain(EXECUTION_EVENTS.EXECUCAO_RECUSADA);
    await http().get(`${base}/ordens/${OS_3}`).set('Authorization', mecanico).expect(200)
      .expect((res) => expect(res.body.ordem.status).toBe('EXECUCAO_RECUSADA'));
  });

  it('erros: 404 OS fora da oficina, 422 regra de domínio, 400 validação, 401/403 permissões', async () => {
    await http().post(`${base}/${OS_1}/diagnostico/iniciar`).set('Authorization', mecanico).expect(404);
    await registry.despachar(criarEnvelope(EXECUTION_COMMANDS.ENFILEIRAR_DIAGNOSTICO, OS_1, {}));
    await http().post(`${base}/${OS_1}/diagnostico/concluir`).set('Authorization', mecanico).expect(422)
      .expect((res) => expect(res.body.code).toBe('TRANSICAO_INVALIDA'));
    await http().post(`${base}/nao-uuid/diagnostico/iniciar`).set('Authorization', mecanico).expect(400);
    await http().post(`${base}/${OS_1}/itens/${ITEM}/apontamento`).set('Authorization', mecanico)
      .send({ acao: 'PAUSAR' }).expect(400);
    await http().get(`${base}/fila?status=INVALIDO`).set('Authorization', mecanico).expect(400);
    await http().get(`${base}/fila`).expect(401);
    await http().get(`${base}/fila`).set('Authorization', cliente).expect(403);
    await http().post(`${base}/${OS_1}/diagnostico/iniciar`).set('Authorization', atendente).expect(403);
    await http().get(`${base}/metricas/tempo-medio`).set('Authorization', mecanico).expect(403);
  });

  it('payload fora do contrato é rejeitado (vai para a DLQ)', async () => {
    await expect(
      registry.despachar(
        criarEnvelope(EXECUTION_COMMANDS.ENFILEIRAR_EXECUCAO, OS_1, { itens: [{ itemId: 'x' }] }),
      ),
    ).rejects.toBeInstanceOf(MensagemInvalidaError);
  });
});

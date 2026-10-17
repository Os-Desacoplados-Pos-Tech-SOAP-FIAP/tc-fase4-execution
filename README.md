# tc-fase4-execution — Execution Service

[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution&metric=bugs)](https://sonarcloud.io/summary/new_code?id=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution)

Microsserviço da **fila da oficina, diagnóstico e reparo** e dono da **capacidade de execução**.
Na saga da OS, é a **transação pivô**: aceita ou recusa a execução conforme a capacidade da oficina.
Depois do aceite a saga não volta mais atrás; uma recusa faz o orquestrador compensar.

Stack: NestJS 10, TypeScript, DynamoDB (tabela única), SNS/SQS FIFO (AWS SDK v3), Pino, OpenTelemetry.

## Responsabilidades

| Recebe (comando, fila `oficina-execution-inbox.fifo`) | Publica (evento, tópico `oficina-execution-events.fifo`) |
|---|---|
| `execution.enfileirar-diagnostico.v1` `{ numeroOs? }` — põe a OS na fila de diagnóstico | — |
| `execution.reabrir-diagnostico.v1` `{}` — volta de `DIAGNOSTICO_CONCLUIDO` para `EM_DIAGNOSTICO` (orçamento recusado/reaberto) | `execution.diagnostico-iniciado.v1` |
| `execution.enfileirar-execucao.v1` `{ itens: [{ itemId, servicoId, descricao }] }` — **pivô** | `execution.execucao-aceita.v1` ou `execution.execucao-recusada.v1` |

Eventos publicados pelas rotas HTTP (ação do mecânico):

| Evento | Payload | Quando |
|---|---|---|
| `execution.diagnostico-iniciado.v1` | `{ osId, mecanicoId }` | mecânico assume o diagnóstico (ou diagnóstico reaberto) |
| `execution.diagnostico-concluido.v1` | `{ osId }` | diagnóstico concluído; o OS Service gera o orçamento |
| `execution.execucao-aceita.v1` | `{ osId }` | pivô aceitou |
| `execution.execucao-recusada.v1` | `{ osId, motivo, mensagem }` | pivô recusou |
| `execution.reparo-iniciado.v1` | `{ osId, mecanicoId }` | mecânico inicia o reparo |
| `execution.servico-executado.v1` | `{ osId, itemId, servicoId, minutos }` | apontamento `FINALIZAR` de um item |
| `execution.execucao-concluida.v1` | `{ osId, minutos }` | reparo concluído |

`motivo` de `execucao-recusada` é um de: `CAPACIDADE_ESGOTADA`, `ORDEM_NAO_ENCONTRADA`, `ORDEM_EM_ESTADO_INVALIDO`.

### API REST

Prefixo `/api/execution`; Swagger em `/api/execution/docs`. Autenticação por JWT (HS256) com claims `sub` e `perfil`.
O padrão do controller é `MECANICO`; as rotas de leitura da fila ampliam o acesso.

| Rota | Descrição | Perfis |
|---|---|---|
| `GET /fila?status=` | Fila da oficina (padrão: aguardando/em diagnóstico e reparo) | MECANICO, ATENDENTE, ADMINISTRADOR |
| `GET /ordens/:osId` | Situação da OS na oficina, com histórico | MECANICO, ATENDENTE, ADMINISTRADOR |
| `POST /:osId/diagnostico/iniciar` | Mecânico assume o diagnóstico | MECANICO |
| `POST /:osId/diagnostico/concluir` | Conclui o diagnóstico | MECANICO |
| `POST /:osId/reparo/iniciar` | Inicia o reparo de uma OS aceita | MECANICO |
| `POST /:osId/itens/:itemId/apontamento` | Corpo `{ "acao": "INICIAR" \| "FINALIZAR" }` | MECANICO |
| `POST /:osId/reparo/concluir` | Conclui o reparo e libera a vaga | MECANICO |
| `GET /metricas/tempo-medio` | Tempo médio de reparo (minutos) | ADMINISTRADOR |
| `GET /metricas/tempo-medio-por-servico` | Tempo médio por tipo de serviço | ADMINISTRADOR |
| `GET /health` | Liveness | público |

### Erros

Corpo padronizado com `statusCode`, `error`, `message` (e `code` nos erros de negócio).

| Causa | Status |
|---|---|
| Validação de entrada / UUID inválido | 400 |
| Token ausente/inválido; perfil sem acesso | 401; 403 |
| OS não está na oficina | 404 |
| Conflito de concorrência (versão otimista) — tente novamente | 409 |
| Regra de negócio (`DomainError`, ex.: transição de status inválida) | 422 |

## Arquitetura

- Camadas DDD: `domain` (OrdemExecucao) → `application` (casos de uso e portas) →
  `infrastructure` (DynamoDB, SNS/SQS, JWT) e `modules` (HTTP e handlers de mensagem).
- **Banco próprio:** DynamoDB, **tabela única** (`oficina-execution`) com um GSI e TTL em `expiraEm`.
- **Observabilidade:** logs estruturados (Pino); traces/métricas OpenTelemetry via OTLP quando
  `OTEL_EXPORTER_OTLP_ENDPOINT` está definido.

### Modelo da tabela

| Item | PK | SK | Observação |
|---|---|---|---|
| Ordem | `OS#<osId>` | `ORDEM` | estado atual, `versao`, `GSI1PK/GSI1SK` da fila |
| Histórico | `OS#<osId>` | `HIST#<data>#<versao>#<índice>` | transições de status |
| Fila (GSI1) | `FILA#<status>` | `<enfileiradoEm>#<osId>` | listagem por status |
| Capacidade | `CAPACIDADE` | `EXECUCAO` | contador `ativos` |
| Métrica geral | `METRICA` | `EXECUCAO` | `totalMinutos`, `quantidade` |
| Métrica por serviço | `METRICA` | `SERVICO#<servicoId>` | `totalMinutos`, `quantidade` |
| Mensagem processada | `MSG#<messageId>` | `MSG` | idempotência, TTL de 7 dias |
| Outbox | `OUTBOX` | `<osId>#<versão>#<índice>#<messageId>` | eventos a publicar |
| Lease da outbox | `LOCK` | `OUTBOX_PUBLISHER` | `dono`, `leaseAte` |

Todo o desenho de chaves fica em `src/infrastructure/dynamo/chaves.ts`.

### Unidade de trabalho e concorrência

- **`TransactWriteItems` único:** o DynamoDB não tem transação interativa. Dentro de `ITransactionManager.run`
  as leituras vão direto à tabela e as escritas (ordem, histórico, capacidade, métricas, mensagem processada
  e outbox) são acumuladas e saem num único commit (limite de 100 operações). Se o caso de uso lança, nada é gravado.
  **Trade-off:** como as leituras acontecem antes das escritas, a atomicidade vem do commit único e a
  consistência vem das condições dele, não de isolamento de leitura.
- **Versão otimista:** cada escrita da ordem exige a versão lida; conflito vira `409` na API ou nova entrega na fila.
- **Métricas O(1):** `totalMinutos` e `quantidade` são acumulados com `ADD` no mesmo commit;
  o tempo médio é um `GetItem`, sem varrer as ordens.

### Pivô da saga (`enfileirar-execucao`)

1. Se a OS já foi aceita (aguardando/em reparo/concluída), só republica `execucao-aceita` (reentrega segura).
2. Só aceita OS em `DIAGNOSTICO_CONCLUIDO` e com `ativos < EXECUTION_MAX_CONCURRENT` (padrão 3).
3. A vaga é ocupada de forma **atômica**: `ADD ativos` com condição `ativos < máximo` no mesmo commit que grava a ordem
   em `AGUARDANDO_REPARO` e o evento `execucao-aceita`. Se outra réplica tomar a última vaga entre a leitura e o
   commit, a condição falha e vira `CAPACIDADE_ESGOTADA` (recusa de negócio, não retentativa).
4. Os motivos do contrato (capacidade, OS inexistente, OS em estado inválido) viram `execucao-recusada` numa segunda
   transação, e o orquestrador compensa (libera reservas de estoque, etc.). Qualquer outro erro propaga: a mensagem
   é retentada e, esgotadas as tentativas, vai para a DLQ.
5. `concluir reparo` libera a vaga (`ativos > 0`).

### Outbox com lease

O evento é gravado na mesma transação do efeito e publicado por um worker (ciclo de 1 s).

- **Publicador único ativo:** um lease no item `LOCK/OUTBOX_PUBLISHER` (escrita condicional com `dono` e `leaseAte`,
  duração de 30 s), renovado a cada ciclo; substitui o advisory lock do Postgres. Réplicas sem o lease esperam
  o próximo ciclo. O lease é liberado no shutdown.
- **Ordem por OS:** as mensagens de cada OS saem na ordem da SK (versão da ordem + índice). Uma mensagem que falha
  bloqueia **somente a própria OS** (`tentativas` e `ultimoErro` são registrados).
- **Janela de segurança:** novos envios só começam nos primeiros 2 s do ciclo (30 s de lease menos 28 s de pior caso
  de um envio), para o último item terminar antes de o lease expirar. Limitação conhecida: o lease não cobre
  diferença de relógio entre réplicas.

### Idempotência e inbox

- Cada `messageId` é registrado (`MSG#<messageId>`, TTL de 7 dias) **na mesma transação do efeito**; reentrega não repete nada.
- Consumidor SQS FIFO com long-poll (20 s, lotes de 10); `MessageGroupId = osId` preserva a ordem da saga por OS.
- Mensagens inválidas ou desconhecidas **não são apagadas**: voltam após o visibility timeout e vão para a
  DLQ após 3 recebimentos (`maxReceiveCount = 3`).
- Shutdown gracioso: o long-poll é abortado e o lote corrente termina antes de encerrar.

## Rodando localmente

```bash
cp .env.example .env     # ajuste JWT_SECRET
npm ci
docker compose up -d     # LocalStack (DynamoDB + SNS/SQS FIFO); a topologia é criada no boot
npm run start:dev        # http://localhost:3003/api/execution/docs
```

O `docker-compose.yml` sobe só as dependências do Execution; o compose com os quatro serviços fica em `tc-fase4-os/local`.
O script `docker/localstack/init-execution.sh` cria a tabela, a fila de entrada com DLQ, o tópico de eventos e uma fila
`oficina-execution-events-spy.fifo` assinando o tópico, útil para observar os eventos publicados.

### Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `PORT` | Porta HTTP (local: `3003`) |
| `NODE_ENV` | Ambiente |
| `JWT_SECRET` | Segredo HS256 compartilhado entre os serviços (obrigatória) |
| `DYNAMO_TABLE` | Nome da tabela (obrigatória; local: `oficina-execution`) |
| `EXECUTION_MAX_CONCURRENT` | Capacidade da oficina, inteiro positivo (padrão `3`) |
| `MESSAGING_ENABLED` | `false` desliga inbox/outbox |
| `AWS_REGION`, `AWS_ENDPOINT_URL` | Região; endpoint só em dev (LocalStack) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credenciais fictícias do LocalStack |
| `INBOX_QUEUE_URL` | URL da fila FIFO de entrada (obrigatória com mensageria ligada) |
| `EVENTS_TOPIC_ARN` | ARN do tópico FIFO de eventos (obrigatória com mensageria ligada) |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | Observabilidade (vazio = desligado) |

A validação roda no boot e falha com a lista de variáveis ausentes.

## Testes

| Script | Escopo |
|---|---|
| `npm test` | Unitários (`src/**/*.spec.ts`) |
| `npm run test:int` | Integração com DynamoDB real no LocalStack (unidade de trabalho, repositórios, outbox) |
| `npm run test:e2e` | HTTP e mensageria ponta a ponta |
| `npm run test:cov` | Todos os projetos com cobertura; limite global mínimo de 80% nas quatro métricas |

Os testes de integração e e2e precisam do LocalStack no ar (`npm run docker:up`).

`test/setup-env.ts` e `test/global-setup.ts` apontam por padrão para o LocalStack em `http://localhost:4566` e, antes
da suíte, recriam do zero a tabela `oficina-execution-test` (a tabela de dev `oficina-execution` não é tocada).
O endpoint é lido de `AWS_ENDPOINT_URL`, só preenchida com o padrão quando não está definida
(`AWS_ENDPOINT_URL=http://localhost:4567 npm run test:int`, por exemplo, usa outro LocalStack).

Se o compose integrado de `tc-fase4-os/local` estiver no ar, o LocalStack dele já ocupa a porta 4566: o teste
reaproveita esse LocalStack (cria a própria tabela nele) e o `docker compose up localstack` deste repositório falha
por conflito de porta. Nesse caso, não suba o LocalStack daqui: rode os testes direto contra o do compose integrado
ou derrube-o antes (`docker compose down` em `tc-fase4-os/local`) e então rode `npm run docker:up`.
Qualidade: `npm run lint:ci` (sem warnings) e `npm run build`.

### Qualidade e cobertura

Painel do projeto no SonarCloud: <https://sonarcloud.io/summary/overall?id=Os-Desacoplados-Pos-Tech-SOAP-FIAP_tc-fase4-execution>.
O SonarCloud analisa todo PR e o check `SonarCloud Code Analysis` (quality gate) é obrigatório para merge na `main`.

## CI/CD

`.github/workflows/ci.yml` (job `ci`): LocalStack como serviço com a topologia criada pelo `init-execution.sh` →
lint → build → testes com cobertura → build da imagem Docker → análise SonarCloud.
`ci` e `SonarCloud Code Analysis` (quality gate) são checks obrigatórios para merge na `main`.

| Workflow | Gatilho | O que faz |
|---|---|---|
| `ci.yml` (job `ci`) | PR e push na `main` | lint, build, testes, imagem, Sonar |
| `terraform.yml` (job `terraform`) | PR/push que mexe em `terraform/` | `fmt -check`, `init -backend=false`, `validate` |
| `terraform.yml` (job `deploy`) | só **Run workflow** (`plan`/`apply`/`destroy`), com aprovação no environment `aws-infra` | aplica ou destrói os recursos do serviço |
| `cd.yml` | CI verde na `main` ou **Run workflow** | imagem no ECR e deploy no EKS |

## Deploy no EKS

### O que o Terraform do serviço cria (`terraform/`)

State em `s3://tc-fase4-tfstate-538880133939/execution/terraform.tfstate`; lê a infra
compartilhada de `infra/terraform.tfstate` (`tc-fase4-infra`).

| Recurso | Nome |
|---|---|
| Tabela DynamoDB (sob demanda, PK/SK, GSI1, TTL em `expiraEm`) | `oficina-execution` |
| Fila FIFO de entrada + DLQ (redrive após 3 recebimentos) | `oficina-execution-inbox.fifo`, `oficina-execution-inbox-dlq.fifo` |
| Tópico FIFO de eventos | `oficina-execution-events.fifo` |
| Role IRSA do pod (consome a inbox, publica no tópico, lê e grava na tabela) | `oficina-fase4-execution` |

A tabela é a mesma do LocalStack (`tc-fase4-os/local/localstack/init.sh`). A role libera só
as operações que o código usa: `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem` e `Query`
(na tabela e no GSI1); o `TransactWriteItems` é autorizado item a item por essas ações.
Configuração de estudo: sem PITR e sem proteção contra exclusão. A assinatura do tópico é
feita pelo OS, que é quem consome os eventos.

### Ordem

`tc-fase4-infra` → catalog → **execution** → billing → os → auth → gateway. Para derrubar,
a ordem inversa (o OS assina o tópico do execution e tem permissão na fila dele).

### Rodar o Terraform

Actions → **Terraform** → **Run workflow** → escolha `plan`, `apply` ou `destroy` → aprove
em **Review deployments**. O `destroy` remove antes o namespace `execution` do cluster (pods
e Ingress), se o cluster estiver no ar.

### O que o CD faz

1. Usa o SHA que passou no CI; pula com aviso se o cluster `oficina-fase4` não está
   `ACTIVE` ou se o Terraform do execution não foi aplicado (state sem outputs).
2. Publica a imagem no ECR com tag = SHA (reaproveita se a tag já existe).
3. Cria o Secret `execution-secret` (só `JWT_SECRET`, lido do Secrets Manager) e o ConfigMap
   `execution-config` (`DYNAMO_TABLE`, `EXECUTION_MAX_CONCURRENT=3`, `INBOX_QUEUE_URL`,
   `EVENTS_TOPIC_ARN`, fixas e, se o Alloy estiver instalado, `OTEL_EXPORTER_OTLP_ENDPOINT`).
4. Aplica `k8s/base` com a imagem do ECR, a role IRSA e o SG do ALB. Sem initContainer e
   sem seed: a tabela já nasce pronta no Terraform. O serviço entra no ALB interno em
   `/api/execution`.
5. Espera o rollout e faz um smoke em `/api/execution/health` de dentro do pod.

### Rollback

Automático quando o rollout falha (`kubectl rollout undo`), com `describe` e logs no job.
Manual: `kubectl rollout undo deployment/execution -n execution`, ou um `git revert` na `main`
(o CD implanta o commit revertido).

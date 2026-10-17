# Kubernetes (Kustomize)

Manifests do Execution no EKS. Aplicados pelo CD (`.github/workflows/cd.yml`), não à mão.

```
k8s/base/
├── kustomization.yaml   # namespace execution + imagem parametrizada (execution -> <ecr>:<sha>)
├── namespace.yaml       # namespace execution
├── serviceaccount.yaml  # SA execution com a role IRSA (${IRSA_ROLE_ARN})
├── deployment.yaml      # app na porta 3000 (sem initContainer: DynamoDB, sem migrations)
├── service.yaml         # ClusterIP 80 -> 3000
└── ingress.yaml         # ALB interno compartilhado, /api/execution (${ALB_SG_ID})
```

Fora do Git, criados pelo CD a cada deploy:

- **ConfigMap `execution-config`**: `NODE_ENV`, `PORT`, `AWS_REGION`, `MESSAGING_ENABLED`,
  `OTEL_SERVICE_NAME`, `EXECUTION_MAX_CONCURRENT=3`, `DYNAMO_TABLE`, `INBOX_QUEUE_URL`,
  `EVENTS_TOPIC_ARN` (outputs do Terraform) e `OTEL_EXPORTER_OTLP_ENDPOINT` quando o
  Alloy está instalado.
- **Secret `execution-secret`**: só `JWT_SECRET`, lido do Secrets Manager.

`AWS_ENDPOINT_URL` nunca é definida no EKS: o SDK usa o endpoint padrão e as
credenciais da role IRSA.

## Validar (sem cluster)

```bash
kubectl kustomize k8s/base
```

`${IRSA_ROLE_ARN}` e `${ALB_SG_ID}` aparecem literais na saída; o CD os substitui com
`envsubst` antes do `kubectl apply`.

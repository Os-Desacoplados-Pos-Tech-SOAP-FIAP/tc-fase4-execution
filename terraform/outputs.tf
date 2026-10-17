# --- Recursos do serviço (lidos pelo CD e, via remote state, pelo OS) ---

output "namespace" {
  description = "Namespace do serviço no EKS."
  value       = local.servico
}

output "inbox_queue_url" {
  description = "URL da fila de entrada (INBOX_QUEUE_URL; o OS envia comandos para ela)."
  value       = aws_sqs_queue.inbox.url
}

output "inbox_queue_arn" {
  description = "ARN da fila de entrada (permissão de SendMessage na role do OS)."
  value       = aws_sqs_queue.inbox.arn
}

output "dlq_url" {
  description = "URL da DLQ da fila de entrada (verificação do smoke)."
  value       = aws_sqs_queue.dlq.url
}

output "events_topic_arn" {
  description = "ARN do tópico de eventos (EVENTS_TOPIC_ARN; o OS assina este tópico)."
  value       = aws_sns_topic.events.arn
}

output "irsa_role_arn" {
  description = "Role IRSA do pod (anotação eks.amazonaws.com/role-arn da ServiceAccount)."
  value       = aws_iam_role.app.arn
}

output "dynamo_table_name" {
  description = "Nome da tabela DynamoDB do serviço (DYNAMO_TABLE)."
  value       = aws_dynamodb_table.this.name
}

# --- Repassados da infra, para o CD ler tudo de um único state ---

output "ecr_repository_url" {
  description = "Repositório ECR do serviço."
  value       = local.infra.ecr_repository_urls[local.servico]
}

output "alb_security_group_id" {
  description = "SG do ALB interno (anotação alb.ingress.kubernetes.io/security-groups)."
  value       = local.infra.alb_security_group_id
}

output "jwt_secret_name" {
  description = "Nome do segredo JWT_SECRET compartilhado no Secrets Manager."
  value       = local.infra.jwt_secret_name
}

# Mensageria do serviço com os mesmos nomes e atributos do LocalStack
# (tc-fase4-os/local/localstack/init.sh): tudo FIFO, sem deduplicação por conteúdo
# (o MessageDeduplicationId é o messageId do envelope) e redrive após 3 tentativas.
#
# Sem assinaturas aqui: quem consome os eventos assina o tópico na própria stack (o OS).
# Sem queue policy na inbox: só o OS envia comandos, pela role IRSA dele, na mesma
# conta; a política IAM basta.
resource "aws_sqs_queue" "dlq" {
  name                        = "oficina-${local.servico}-inbox-dlq.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
}

resource "aws_sqs_queue" "inbox" {
  name                        = "oficina-${local.servico}-inbox.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  visibility_timeout_seconds  = 30

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sns_topic" "events" {
  name                        = "oficina-${local.servico}-events.fifo"
  fifo_topic                  = true
  content_based_deduplication = false
}

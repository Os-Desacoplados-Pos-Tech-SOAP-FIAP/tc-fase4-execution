# Tabela única do Execution, idêntica à do LocalStack (tc-fase4-os/local/localstack/init.sh):
# PK/SK, GSI1 (GSI1PK/GSI1SK, projeção ALL) para a fila por status e TTL em `expiraEm`
# (registros de mensagem processada). O desenho de chaves está em
# src/infrastructure/dynamo/chaves.ts. O nome é o mesmo usado no código (DYNAMO_TABLE).
#
# Configuração de estudo: sob demanda, sem PITR e sem proteção contra exclusão, para o
# destroy dos ensaios ser rápido e barato.
resource "aws_dynamodb_table" "this" {
  name         = "oficina-${local.servico}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiraEm"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }

  deletion_protection_enabled = false
}

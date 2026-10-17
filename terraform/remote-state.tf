# Infra compartilhada (VPC, EKS, ECR, segredos, ALB) vem do state do tc-fase4-infra.
# Ordem de apply: infra -> este serviço.
data "terraform_remote_state" "infra" {
  backend = "s3"

  config = {
    bucket = "tc-fase4-tfstate-538880133939"
    key    = "infra/terraform.tfstate"
    region = "us-east-1"
  }
}

locals {
  servico         = "execution"
  nome            = "oficina-fase4-execution"
  infra           = data.terraform_remote_state.infra.outputs
  service_account = "system:serviceaccount:execution:execution"
}

#!/bin/bash
# Topologia do Execution no LocalStack (mesmos nomes da AWS).
set -euo pipefail
R=us-east-1

awslocal dynamodb create-table --region $R --table-name oficina-execution \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S AttributeName=GSI1SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes 'IndexName=GSI1,KeySchema=[{AttributeName=GSI1PK,KeyType=HASH},{AttributeName=GSI1SK,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
  --billing-mode PAY_PER_REQUEST
awslocal dynamodb update-time-to-live --region $R --table-name oficina-execution \
  --time-to-live-specification Enabled=true,AttributeName=expiraEm

DLQ_URL=$(awslocal sqs create-queue --region $R --queue-name oficina-execution-inbox-dlq.fifo \
  --attributes FifoQueue=true --query QueueUrl --output text)
DLQ_ARN=$(awslocal sqs get-queue-attributes --region $R --queue-url "$DLQ_URL" \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)
awslocal sqs create-queue --region $R --queue-name oficina-execution-inbox.fifo \
  --attributes "{\"FifoQueue\":\"true\",\"VisibilityTimeout\":\"30\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

awslocal sns create-topic --region $R --name oficina-execution-events.fifo \
  --attributes FifoTopic=true,ContentBasedDeduplication=false
SPY_URL=$(awslocal sqs create-queue --region $R --queue-name oficina-execution-events-spy.fifo \
  --attributes FifoQueue=true --query QueueUrl --output text)
SPY_ARN=$(awslocal sqs get-queue-attributes --region $R --queue-url "$SPY_URL" \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)
awslocal sns subscribe --region $R \
  --topic-arn arn:aws:sns:$R:000000000000:oficina-execution-events.fifo \
  --protocol sqs --notification-endpoint "$SPY_ARN" --attributes RawMessageDelivery=true

echo "execution: topologia DynamoDB/SNS/SQS criada"

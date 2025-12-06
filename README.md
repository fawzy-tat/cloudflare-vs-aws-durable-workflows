# Ticket Reservation with Hold & Expiry

## Cloudflare Workflows vs AWS Lambda Durable Functions

Two implementations of the same durable workflow pattern — a ticket reservation system with 15-minute hold and auto-expiry.

| Platform       | Cloudflare Workflows  | AWS Lambda Durable Functions |
| -------------- | --------------------- | ---------------------------- |
| **Region**     | Global (edge)         | **us-east-2 only**           |
| **Runtime**    | Workers (V8 isolates) | Node.js 24                   |
| **Local Dev**  | `wrangler dev`        | Testing SDK                  |
| **Invocation** | Sync                  | Async only (for >15min)      |
| **Deploy**     | `wrangler deploy`     | SAM or AWS CLI               |

---

## 🎯 The Workflow

```
POST /reserve
     │
     ▼
┌─────────────────┐
│ STEP 1: Create  │ ◄── Checkpointed
│ Hold (15 min)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ WAIT: 15 min    │ ◄── No compute cost during wait!
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ STEP 2: Expire  │ ◄── If not confirmed
│ or Confirm      │
└─────────────────┘
```

---

## 🟠 Cloudflare Workflows

### Quick Start

```bash
cd cf-workflow
pnpm install
pnpm wrangler login
pnpm wrangler kv namespace create RESERVATIONS_KV
# Update wrangler.jsonc with the namespace ID
pnpm wrangler dev   # Local development
pnpm deploy         # Deploy to Cloudflare
```

### Test

```bash
curl -X POST https://YOUR_WORKER.workers.dev/reserve \
  -H "Content-Type: application/json" \
  -d '{"seatId": "A1", "userId": "user123"}'
```

---

## 🟡 AWS Lambda Durable Functions

### ⚠️ Critical Requirements

| Requirement  | Details                                              |
| ------------ | ---------------------------------------------------- |
| **Region**   | **us-east-2** (only region available)                |
| **Runtime**  | Node.js 24 (`nodejs24.x`)                            |
| **Creation** | Must enable durable at function **creation time**    |
| **Invoke**   | Must use `--invocation-type Event` (async)           |
| **IAM**      | Needs `lambda:CheckpointDurableExecution` permission |
| **SAM CLI**  | Requires **v1.150.0+** for `DurableConfig` support   |

---

> ⚠️ **Choose ONE deployment method** — SAM or AWS CLI. Both are provided for demonstration purposes.

### Option A: SAM Deployment (Recommended)

SAM handles IAM roles, versions, and aliases automatically. Best for production use.

#### Prerequisites

```bash
# Check SAM CLI version (v1.150.0+ required)
sam --version

# Upgrade if needed
pip3 install --upgrade aws-sam-cli
```

#### Deploy

```bash
cd aws-durable_functions/reservation-workflow
pnpm install

# First deployment (guided setup)
pnpm sam:deploy:guided

# Follow the prompts:
# - Stack Name: reservation-workflow-stack (default)
# - Region: us-east-2 (REQUIRED)
# - Confirm changes: Y
# - Allow SAM to create IAM roles: Y
# - Save settings: Y

# Subsequent deployments
pnpm sam:deploy
```

#### Invoke and Test

```bash
# Invoke the function
pnpm invoke

# Check execution status (use ARN from invoke response)
aws lambda get-durable-execution \
  --region us-east-2 \
  --durable-execution-arn "YOUR_ARN_HERE"
```

#### View Logs

```bash
pnpm sam:logs
```

#### Cleanup

```bash
pnpm sam:delete
```

---

### Option B: AWS CLI Deployment (Alternative)

Manual deployment for learning or when you need more control. Requires manual IAM setup.

#### Step 1: Create `.env` File

```bash
cd aws-durable_functions/reservation-workflow

echo "AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)" > .env
```

#### Step 2: Create IAM Role

```bash
# Create execution role
aws iam create-role \
  --role-name durable-reservation-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach basic Lambda policy
aws iam attach-role-policy \
  --role-name durable-reservation-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Add durable execution permissions
aws iam put-role-policy \
  --role-name durable-reservation-role \
  --policy-name DurableExecutionPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "lambda:CheckpointDurableExecution",
        "lambda:GetDurableExecutionState"
      ],
      "Resource": "arn:aws:lambda:us-east-2:*:function:reservation-workflow-dev:*"
    }]
  }'

sleep 10  # Wait for IAM propagation
```

#### Step 3: Deploy

```bash
pnpm install
pnpm create-lambda
```

#### Step 4: Invoke and Test

```bash
pnpm invoke

# Check status with ARN from response
aws lambda get-durable-execution \
  --region us-east-2 \
  --durable-execution-arn "YOUR_ARN_HERE"
```

#### Cleanup

```bash
pnpm delete-lambda

# Remove IAM role
aws iam delete-role-policy --role-name durable-reservation-role --policy-name DurableExecutionPolicy
aws iam detach-role-policy --role-name durable-reservation-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name durable-reservation-role
```

---

## 🧪 Local Testing

Both platforms support local testing without deploying:

### Cloudflare

```bash
cd cf-workflow
pnpm wrangler dev
# Runs locally at http://localhost:8787
```

### AWS

```bash
cd aws-durable_functions/reservation-workflow
pnpm test
```

Uses `LocalDurableTestRunner` from `@aws/durable-execution-sdk-js-testing` to simulate checkpointing and time-skipping locally.

---

## 📦 Available Scripts (AWS)

| Script                   | Description                               |
| ------------------------ | ----------------------------------------- |
| `pnpm test`              | Run tests locally with Testing SDK        |
| `pnpm build`             | Bundle code with esbuild                  |
| `pnpm sam:deploy`        | Build and deploy with SAM                 |
| `pnpm sam:deploy:guided` | First-time guided deployment              |
| `pnpm sam:delete`        | Delete the SAM stack                      |
| `pnpm sam:logs`          | Tail function logs                        |
| `pnpm create-lambda`     | Build, package, and create Lambda via CLI |
| `pnpm update-lambda`     | Update existing function code             |
| `pnpm invoke`            | Invoke the function (async)               |
| `pnpm delete-lambda`     | Delete the Lambda function                |

---

## 🔄 Key Differences

| Aspect            | Cloudflare Workflows       | AWS Durable Functions          |
| ----------------- | -------------------------- | ------------------------------ |
| **Sleep Syntax**  | `step.sleep('15 minutes')` | `context.wait({seconds: 900})` |
| **Step Syntax**   | `step.do('name', fn)`      | `context.step(fn)`             |
| **State Storage** | Workers KV                 | Built-in (checkpointed)        |
| **Invocation**    | Sync or Async              | Async only (for long timeouts) |
| **Local Testing** | `wrangler dev`             | Testing SDK (`pnpm test`)      |
| **IaC Support**   | Wrangler (JSONC)           | SAM / CloudFormation           |

---

## 🔧 AWS Troubleshooting

| Error                           | Cause                         | Fix                                            |
| ------------------------------- | ----------------------------- | ---------------------------------------------- |
| Region not supported            | Wrong region                  | Use `--region us-east-2`                       |
| CheckpointUnrecoverableError    | Missing IAM permissions       | Add `lambda:CheckpointDurableExecution` policy |
| DurableConfig cannot update     | Added to existing function    | Delete & recreate function                     |
| DurableConfig not defined (SAM) | SAM CLI version < 1.150.0     | `pip3 install --upgrade aws-sam-cli`           |
| Function not found              | Wrong function name/qualifier | Use `reservation-workflow-dev` + `live` alias  |

---

## 📚 Resources

### Cloudflare

- [Workflows Documentation](https://developers.cloudflare.com/workflows/)
- [Workflows Guide](https://developers.cloudflare.com/workflows/get-started/guide/)

### AWS

- [Durable Functions Overview](https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html)
- [Getting Started](https://docs.aws.amazon.com/lambda/latest/dg/durable-getting-started.html)
- [SAM DurableConfig Property](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-durableconfig.html)
- [Testing Durable Functions](https://docs.aws.amazon.com/lambda/latest/dg/durable-testing.html)

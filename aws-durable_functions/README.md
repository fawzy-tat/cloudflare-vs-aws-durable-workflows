# AWS Lambda Durable Functions

> **See the main [README](../README.md) for full documentation.**

> ⚠️ **Choose ONE deployment method** — SAM (recommended) or AWS CLI. Both are provided for demonstration.

## Quick Start (SAM)

```bash
cd reservation-workflow
pnpm install

# SAM deployment (recommended)
pnpm sam:deploy:guided

# Invoke
pnpm invoke
```

## Requirements

- **Region:** us-east-2 only
- **Runtime:** Node.js 24
- **SAM CLI:** v1.150.0+ (`pip3 install --upgrade aws-sam-cli`)

## Scripts

| Script                   | Description                  |
| ------------------------ | ---------------------------- |
| `pnpm test`              | Run tests locally            |
| `pnpm sam:deploy:guided` | First-time guided deployment |
| `pnpm sam:deploy`        | Deploy (uses saved settings) |
| `pnpm sam:delete`        | Delete the SAM stack         |
| `pnpm invoke`            | Invoke the function          |
| `pnpm create-lambda`     | Deploy via AWS CLI (manual)  |
| `pnpm delete-lambda`     | Delete via AWS CLI           |

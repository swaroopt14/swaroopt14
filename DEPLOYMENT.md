# Deployment (EC2 + Jenkins) — Super Simple Step‑By‑Step

This file is written to be **very simple**. Follow the steps exactly.

## 1) Launch EC2
1. Create a **t3.medium** (or bigger) EC2.
2. Security Group inbound rules (minimum):
   - `22` (SSH)
   - `3000` (zord-console)
   - `8080` (zord-edge API)
   - Optional: `8082` (relay health), `8083` (intent engine health), `8087` (token enclave)

## 2) SSH into EC2
```bash
ssh -i /path/to/key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

## 3) Install Docker + Compose
```bash
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 4) Install Jenkins (Port 2026)
```bash
sudo apt-get install -y fontconfig openjdk-17-jre
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null
echo deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/ | sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y jenkins
sudo systemctl enable jenkins
sudo systemctl start jenkins
sudo systemctl status jenkins --no-pager
```

Open Jenkins in browser:
```
http://YOUR_EC2_PUBLIC_IP:2026
```
Get the initial admin password:
```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

### Change Jenkins port to 2026
```bash
sudo sed -i 's/^HTTP_PORT=.*/HTTP_PORT=2026/' /etc/default/jenkins
sudo systemctl restart jenkins
sudo systemctl status jenkins --no-pager
```

**Security Group:** allow inbound `2026` from your IP.

## 5) Install Git + allow Jenkins to use Docker
```bash
sudo apt-get install -y git
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
```

## 6) Create a Jenkins Pipeline job
1. Jenkins UI → **New Item**
2. Name: `arealis-zord`
3. Type: **Pipeline**
4. Pipeline definition: **Pipeline script from SCM**
5. SCM: **Git**
6. Repo URL: `https://github.com/Arealis-network/Arealis-Zord.git`
7. Credentials: select your `github-pat`
8. Script Path: `jenkins/Jenkinsfile`
9. Save

## 7) Create Jenkins credentials (exact IDs)
Go to **Manage Jenkins → Credentials → (global) → Add Credentials**  
Create these with the exact **IDs**:

- `github-pat` (Secret text OR Username/Password)
- `aws-access-key-id` (Secret text)
- `aws-secret-access-key` (Secret text)
- `edge-db-user` (Secret text)
- `edge-db-password` (Secret text)
- `edge-db-name` (Secret text)
- `intent-db-user` (Secret text)
- `intent-db-password` (Secret text)
- `intent-db-name` (Secret text)
- `relay-db-user` (Secret text)
- `relay-db-password` (Secret text)
- `relay-db-name` (Secret text)
- `token-db-user` (Secret text)
- `token-db-password` (Secret text)
- `token-db-name` (Secret text)
- `token-enclave-master-key` (Secret text)
- `pii-token-secret` (Secret text)
- `gemini-api-key` (Secret text)
- `gemini-api-keys` (Secret text)
- `edge-signing-key` (Secret file → upload `ed25519_private.pem`)

Use `jenkins/credentials.template.env` as your checklist.

## 8) Run the Jenkins job
1. Open the `arealis-zord` job
2. Click **Build with Parameters**
3. Choose `RUN_INFRA=true` for single‑EC2 (DB/Kafka/Redis/Chroma)
4. Click **Build**

## 9) Verify deployment
From EC2:
```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:3000/api/health
```

## 10) If you want manual deployment (no Jenkins)
Skip Jenkins and follow the manual section below.

---

# Manual Deployment (No Jenkins)

## A) Clone the repo
```bash
git clone https://github.com/Arealis-network/Arealis-Zord.git
cd Arealis-Zord
```

## B) Create folders for env + secrets
```bash
mkdir -p k8s-file/production/env
mkdir -p k8s-file/production/secrets
```

## C) Create the signing key (required)
```bash
ssh-keygen -t ed25519 -f k8s-file/production/secrets/ed25519_private.pem -N ""
chmod 600 k8s-file/production/secrets/ed25519_private.pem
```

## D) Create the main `.env` (for infra containers)
Create a file named `.env` in repo root:
```env
EDGE_DB_USER=zord_user
EDGE_DB_PASSWORD=REPLACE_STRONG_PASSWORD
EDGE_DB_NAME=zord_edge_db

INTENT_DB_USER=intent_user
INTENT_DB_PASSWORD=REPLACE_STRONG_PASSWORD
INTENT_DB_NAME=zord_intent_engine_db

RELAY_DB_USER=relay_user
RELAY_DB_PASSWORD=REPLACE_STRONG_PASSWORD
RELAY_DB_NAME=zord_relay_db

TOKEN_DB_USER=token_user
TOKEN_DB_PASSWORD=REPLACE_STRONG_PASSWORD
TOKEN_DB_NAME=zord_token_enclave_db
```

## E) Create service env files (copy exactly)

### `k8s-file/production/env/zord-edge.env`
```env
DB_HOST=zord-edge-postgres
DB_PORT=5432
DB_USER=zord_user
DB_PASSWORD=REPLACE_STRONG_PASSWORD
DB_NAME=zord_edge_db
DB_SSLMODE=disable
REDIS_ADDR=zord-redis:6379

AWS_ACCESS_KEY_ID=REPLACE
AWS_SECRET_ACCESS_KEY=REPLACE
AWS_REGION=ap-south-1
S3_BUCKET=arealis-zord-vault
AWS_EC2_METADATA_DISABLED=true

OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector:4317
OTEL_EXPORTER_OTLP_INSECURE=true

SIGNING_KEY_PATH=/run/secrets/ed25519_private.pem
```

### `k8s-file/production/env/zord-intent-engine.env`
```env
DB_HOST=zord-intent-postgres
DB_PORT=5432
DB_USER=intent_user
DB_PASSWORD=REPLACE_STRONG_PASSWORD
DB_NAME=zord_intent_engine_db
DB_SSLMODE=disable
REDIS_ADDR=zord-redis:6379

ZORD_PII_ENCLAVE_URL=http://zord-token-enclave:8087

AWS_ACCESS_KEY_ID=REPLACE
AWS_SECRET_ACCESS_KEY=REPLACE
AWS_REGION=ap-southeast-2
S3_BUCKET=canonical-worm-storage
AWS_EC2_METADATA_DISABLED=true

OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector:4317
OTEL_EXPORTER_OTLP_INSECURE=true
```

### `k8s-file/production/env/zord-relay.env`
```env
KAFKA_BROKERS=zord-kafka:9092
KAFKA_CONSUMER_GROUP=zord-relay-group
KAFKA_READY_TOPIC=z.intent.ready.v1
KAFKA_DLQ_TOPIC=z.intent.dlq.v1
KAFKA_PUBLISH_FAILURE_DLQ_TOPIC=z.intent.publish_failure.dlq.v1
KAFKA_POISON_EVENT_DLQ_TOPIC=z.intent.poison_event.dlq.v1
INTENT_ENGINE_BASE_URL=http://zord-intent-engine:8083

OUTBOX_POLL_INTERVAL=5s
OUTBOX_BATCH_SIZE=10
OUTBOX_WORKER_COUNT=8
OUTBOX_MAX_ATTEMPTS=7
OUTBOX_MAX_AGE=8h

OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector:4317
OTEL_EXPORTER_OTLP_INSECURE=true
```

### `k8s-file/production/env/zord-token-enclave.env`
```env
PORT=8087
DB_HOST=zord-token-enclave-postgres
DB_PORT=5432
DB_USER=token_user
DB_PASSWORD=REPLACE_STRONG_PASSWORD
DB_NAME=zord_token_enclave_db
DB_SSLMODE=disable
MASTER_KEY=REPLACE_BASE64_32_BYTES

OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector:4317
OTEL_EXPORTER_OTLP_INSECURE=true
```

### `k8s-file/production/env/zord-prompt-layer.env`
```env
SERVICE_NAME=zord-prompt-layer
HTTP_PORT=8086
GEMINI_API_KEY=REPLACE
GEMINI_API_KEYS=REPLACE
GEMINI_MODEL=gemini-2.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta

EDGE_READ_DSN=postgres://zord_user:REPLACE_STRONG_PASSWORD@zord-edge-postgres:5432/zord_edge_db?sslmode=disable
INTENT_READ_DSN=postgres://intent_user:REPLACE_STRONG_PASSWORD@zord-intent-postgres:5432/zord_intent_engine_db?sslmode=disable
RELAY_READ_DSN=postgres://relay_user:REPLACE_STRONG_PASSWORD@zord-relay-postgres:5432/zord_relay_db?sslmode=disable

CHROMA_URL=http://chroma:8000
CHROMA_COLLECTION=zord_prompt_chunks
DEFAULT_TOP_K=5
EMBEDDING_MODEL_PATH=./assets/models/bge-small-en-v1.5/model.onnx
TOKENIZER_PATH=./assets/models/bge-small-en-v1.5/tokenizer.json
EMBEDDING_INPUT_IDS_NAME=input_ids
EMBEDDING_ATTENTION_MASK_NAME=attention_mask
EMBEDDING_TOKEN_TYPE_IDS_NAME=token_type_ids
EMBEDDING_OUTPUT_NAME=last_hidden_state
EMBEDDING_MAX_LENGTH=256

OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector:4317
OTEL_EXPORTER_OTLP_INSECURE=true
```

### `k8s-file/production/env/zord-console.env`
```env
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
PORT=3000
HOSTNAME=0.0.0.0
ZORD_EDGE_URL=http://zord-edge:8080
ZORD_RELAY_URL=http://zord-relay:8082
ZORD_INTENT_ENGINE_URL=http://zord-intent-engine:8083
ZORD_PII_ENCLAVE_URL=http://zord-token-enclave:8087
```

## F) Start everything (including DB/Kafka/Redis/Chroma)
```bash
docker compose -f docker-compose.prod.yml --profile infra up -d --build
```

## G) Check status
```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:3000/api/health
```

## H) Stop everything
```bash
docker compose -f docker-compose.prod.yml down
```

## Notes
1. If you don’t run any observability stack, OTEL settings can stay as-is (they just won’t export).
2. Keep `k8s-file/production/env/*` and `k8s-file/production/secrets/*` private. Do **not** commit.


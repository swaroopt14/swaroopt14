# Jenkins Pipeline (SCM Deploy)

Use this file in Jenkins:

- Pipeline script path: `jenkins/Jenkinsfile`

## What it does

1. Checks out your SCM branch.
2. Verifies Docker and Docker Compose on the Jenkins EC2 host.
3. Injects AWS secrets into `backend/zord-intent-engine/.env`.
4. Runs deploy using `docker-compose.ec2.yml`.
5. Verifies app health at `http://127.0.0.1/api/health`.

## Jenkins job setup

1. Create Jenkins Pipeline job.
2. Choose `Pipeline script from SCM`.
3. Select your Git repo and branch.
4. Set script path: `jenkins/Jenkinsfile`.

## Required Jenkins credentials

Create these as `Secret text` credentials:

- `aws-access-key-id`
- `aws-secret-access-key`

## EC2 host requirements

- Jenkins user must be able to run Docker:
  - `sudo usermod -aG docker jenkins`
  - Restart Jenkins service/instance after group change.
- Docker Engine + Docker Compose plugin installed.
- Security Group inbound:
  - `80` (HTTP)
  - `22` (SSH)

## Triggering deploy

- Run build manually, or
- Configure webhook/poll SCM for auto deploy on push.

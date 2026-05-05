# Jenkins Deployment Guide

This guide explains how to deploy the Arealis Zord services with Jenkins.

## Pipeline Files

- `jenkins/Jenkinsfile.service-ecr`
  Deploy one service at a time.
- `jenkins/Jenkinsfile.all-services-ecr`
  Deploy multiple services in one run.

## What The Pipelines Do

1. Check out this repository.
2. Optionally run SonarQube analysis.
3. Make sure the target Amazon ECR repository exists.
4. Build the Docker image from `backend/<service>`.
5. Push the image to Amazon ECR.
6. Update the Kubernetes manifest in `kubernetes/eks/services/<service>/deployment.yaml`.
7. Commit and push the manifest change back to GitHub.

## Before You Start

Make sure your Jenkins agent has:

- Docker CLI with permission to build and push images
- AWS CLI v2
- Git
- Bash or another Unix-like shell
- SonarScanner installed in Jenkins if you want SonarQube scans

## Step 1: Create Jenkins Credentials

Create these credentials in Jenkins.

### GitHub Credential

- Credential ID: `github-pat`
- Type: `Username with password`
- Username: your GitHub username
- Password: a GitHub personal access token with repo write access

### AWS Credential

Only required if `USE_INSTANCE_ROLE=false`.

- Credential ID: `aws-ecr-credentials`
- Type: `Username with password`
- Username: AWS access key ID
- Password: AWS secret access key

## Step 2: Configure SonarQube In Jenkins

Only needed if you want SonarQube analysis.

1. Open `Manage Jenkins`.
2. Open `System`.
3. Find `SonarQube servers`.
4. Add your SonarQube server.
5. Set the server name, for example `sonarqube`.
6. Add the required authentication token.

Then configure the scanner tool:

1. Open `Manage Jenkins`.
2. Open `Tools`.
3. Find `SonarQube Scanner`.
4. Add a scanner installation.
5. Set the tool name, for example `sonar-scanner`.

## Step 3: Create The Jenkins Job

### For One Service

1. Create a new Jenkins pipeline job.
2. Choose `Pipeline`.
3. In the pipeline definition, use `Pipeline script from SCM`.
4. Select your Git repository.
5. Set the script path to `jenkins/Jenkinsfile.service-ecr`.
6. Save the job.

### For All Services

1. Create another Jenkins pipeline job.
2. Choose `Pipeline`.
3. In the pipeline definition, use `Pipeline script from SCM`.
4. Select your Git repository.
5. Set the script path to `jenkins/Jenkinsfile.all-services-ecr`.
6. Save the job.

## Step 4: Choose Pipeline Parameters

These are the important parameters used by the pipelines.

- `AWS_ACCOUNT_ID`
  Your AWS account ID.
- `AWS_REGION`
  Example: `ap-south-1`.
- `IMAGE_TAG`
  Optional image tag. If left empty, Jenkins uses `vBUILD_NUMBER`.
- `GIT_BRANCH`
  Branch to update in GitHub. Use values like `main`.
- `ECR_REPOSITORY_PREFIX`
  Repository namespace in ECR, for example `zord`.
- `USE_INSTANCE_ROLE`
  Keep this `true` if Jenkins runs on an EC2 instance with a working IAM role.
- `RUN_SONARQUBE`
  Set to `true` to scan code before building.
- `SONARQUBE_ENV`
  Jenkins SonarQube server name, for example `sonarqube`.
- `SONAR_SCANNER_TOOL`
  Jenkins SonarScanner tool name, for example `sonar-scanner`.
- `SONAR_PROJECT_KEY_PREFIX`
  Base SonarQube project key prefix, for example `Arealis-network_Arealis-Zord`.
- `PUSH_MANIFEST_CHANGES`
  If `true`, Jenkins commits the updated deployment manifest and pushes it to GitHub.

Extra parameters by pipeline:

- `SERVICE_NAME`
  Used only in `Jenkinsfile.service-ecr`.
- `SERVICES`
  Comma-separated list used only in `Jenkinsfile.all-services-ecr`.

## Step 5: Run Single-Service Deployment

Use `jenkins/Jenkinsfile.service-ecr` when you want to deploy one service.

1. Open the Jenkins job for single-service deployment.
2. Click `Build with Parameters`.
3. Select the `SERVICE_NAME`.
4. Fill in or confirm the remaining parameters.
5. Start the build.
6. Jenkins will:
   - optionally run SonarQube
   - build the Docker image
   - push the image to ECR
   - update the Kubernetes deployment manifest
   - commit and push the manifest change

## Step 6: Run Multi-Service Deployment

Use `jenkins/Jenkinsfile.all-services-ecr` when you want to deploy multiple services.

1. Open the Jenkins job for all-services deployment.
2. Click `Build with Parameters`.
3. In `SERVICES`, enter a comma-separated list such as:

```text
zord-console,zord-edge,zord-intelligence
```

4. Fill in or confirm the remaining parameters.
5. Start the build.
6. Jenkins will repeat the full deploy flow for each listed service.

## Step 7: Apply The Updated Kubernetes Manifests

These Jenkins pipelines update the manifest files in GitHub, but they do not directly run `kubectl apply`.

After Jenkins updates the deployment YAML files, apply them to your cluster using your normal Kubernetes deployment flow, for example:

```bash
kubectl apply -f kubernetes/eks/services/zord-console/deployment.yaml
```

If you use Argo CD, Flux, or another GitOps tool, that tool should pick up the manifest change from GitHub and deploy it automatically.

## SonarQube Project Pattern

The pipeline creates one SonarQube analysis per service.

Examples:

- `Arealis-network_Arealis-Zord:zord-console`
- `Arealis-network_Arealis-Zord:zord-edge`
- `Arealis-network_Arealis-Zord:zord-intelligence`

## Common Folder Pattern

Each deployable service is expected to follow this structure:

- `backend/<service>`
- `backend/<service>/Dockerfile`
- `kubernetes/eks/services/<service>/deployment.yaml`

Example:

- `backend/zord-console`
- `backend/zord-console/Dockerfile`
- `kubernetes/eks/services/zord-console/deployment.yaml`

## Troubleshooting

### SonarQube Stage Fails

Check:

- Jenkins SonarQube server name matches `SONARQUBE_ENV`
- Jenkins SonarScanner tool name matches `SONAR_SCANNER_TOOL`
- Jenkins agent can reach the SonarQube server

### AWS Push Fails

Check:

- `AWS_ACCOUNT_ID` and `AWS_REGION`
- IAM role permissions or `aws-ecr-credentials`
- ECR repository naming under `ECR_REPOSITORY_PREFIX`

### Git Push Fails

Check:

- `github-pat` exists in Jenkins
- the token has repo write access
- `GIT_BRANCH` is correct, for example `main`

### Manifest Update Fails

Check:

- the service folder exists under `backend/`
- the deployment file exists under `kubernetes/eks/services/`
- the deployment YAML contains an `image:` field

## Recommended Defaults

For your current setup, these values are a good starting point:

- `AWS_ACCOUNT_ID=522189039032`
- `AWS_REGION=ap-south-1`
- `ECR_REPOSITORY_PREFIX=zord`
- `GIT_BRANCH=main`
- `USE_INSTANCE_ROLE=true`
- `RUN_SONARQUBE=true`
- `SONARQUBE_ENV=sonarqube`
- `SONAR_SCANNER_TOOL=sonar-scanner`

## Quick Example

### Single Service

- Script path: `jenkins/Jenkinsfile.service-ecr`
- `SERVICE_NAME=zord-console`
- `IMAGE_TAG=v10`

### All Services

- Script path: `jenkins/Jenkinsfile.all-services-ecr`
- `SERVICES=zord-console,zord-edge,zord-intelligence`
- `IMAGE_TAG=v10`

# Jenkins Pipelines

This folder contains reusable Jenkins pipelines for the Arealis Zord services.

## Files

- `Jenkinsfile.service-ecr`: build one service, create its ECR repository if needed, push the image, and update the matching Kubernetes `deployment.yaml`.
- `Jenkinsfile.all-services-ecr`: do the same flow for all deployable services in one run.

## What The Pipelines Do

1. Check out this repository.
2. Make sure the target Amazon ECR repository exists.
3. Build the Docker image from `backend/<service>`.
4. Push the image to ECR.
5. Update `kubernetes/eks/services/<service>/deployment.yaml` with the new image.
6. Commit and push that manifest change back to GitHub.

## Jenkins Agent Requirements

The Jenkins agent running these pipelines should have:

- Docker CLI with permission to build/push images
- AWS CLI v2
- Git
- A Unix-like shell (`bash`)

## Required Jenkins Credentials

Create these credentials in Jenkins:

- `github-pat`
  - Type: `Username with password`
  - Username: GitHub username
  - Password: GitHub personal access token with repo write access

Optional:

- `aws-ecr-credentials`
  - Type: `Username with password`
  - Username: AWS access key ID
  - Password: AWS secret access key
  - Only needed if you disable `USE_INSTANCE_ROLE`

## Typical Parameters

- `AWS_ACCOUNT_ID`: your AWS account ID
- `AWS_REGION`: for example `ap-south-1`
- `GIT_BRANCH`: branch to update in GitHub
- `IMAGE_TAG`: optional explicit tag; if empty, the pipeline uses `vBUILD_NUMBER` such as `v1`, `v2`, `v3`
- `ECR_REPOSITORY_PREFIX`: optional namespace such as `arealis`
- `USE_INSTANCE_ROLE`: use the EC2 instance IAM role instead of Jenkins-stored AWS keys

## Example Jenkins Pipeline Paths

- `jenkins/Jenkinsfile.service-ecr`
- `jenkins/Jenkinsfile.all-services-ecr`

## Notes

- If Jenkins runs on an EC2 instance with a working IAM role, leave `USE_INSTANCE_ROLE=true`.
- These pipelines assume the service folder name matches the Kubernetes folder name, for example:
  - `backend/zord-console`
  - `kubernetes/eks/services/zord-console/deployment.yaml`
- The manifest update step replaces the `image:` value inside that service's deployment file.

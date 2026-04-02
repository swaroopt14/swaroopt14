# Jenkins Testing Pipeline Setup on EC2

This guide sets up the testing pipeline defined in `jenkins/Jenkinsfile.testing`.

It covers:

1. Jenkins on an EC2 Linux host
2. Go and Node.js required by this repository
3. SonarQube setup
4. Jenkins job configuration
5. First test run

## 1. What this pipeline does

Pipeline file:

- `jenkins/Jenkinsfile.testing`

Stages:

1. Checkout source from GitHub
2. Run Go unit test commands across backend services
3. Run frontend validation for `backend/zord-console`
4. Run SonarQube analysis
5. Wait for SonarQube Quality Gate

## 2. EC2 host requirements

Use a Linux EC2 instance for Jenkins. This pipeline uses `sh`, so do not run it on a Windows Jenkins agent.

Minimum tools needed on the Jenkins machine:

- Git
- Java 17 or later
- Jenkins
- Go `1.25.x`
- Node.js `20.x`
- npm
- SonarQube Scanner configured in Jenkins

Optional but recommended:

- Docker, if you want to run SonarQube on the same EC2 host

## 3. Open the EC2 security group

Allow these inbound ports:

- `22` for SSH
- `8080` for Jenkins
- `9000` for SonarQube

If you already use a reverse proxy, expose only the proxy port and keep Jenkins/SonarQube private.

## 4. Install Jenkins on EC2

Example below is for Amazon Linux 2023.

```bash
sudo dnf update -y
sudo dnf install -y git wget curl fontconfig java-17-amazon-corretto
```

Install Jenkins:

```bash
sudo wget -O /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo
sudo rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key
sudo dnf install -y jenkins
sudo systemctl enable jenkins
sudo systemctl start jenkins
sudo systemctl status jenkins
```

Get the initial admin password:

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Open Jenkins in the browser:

```text
http://<EC2-PUBLIC-IP>:8080
```

Complete the initial Jenkins setup wizard.

## 5. Install Go and Node.js on EC2

Install Node.js 20:

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v
npm -v
```

Install Go 1.25.x:

```bash
cd /tmp
curl -LO https://go.dev/dl/go1.25.6.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.25.6.linux-amd64.tar.gz
echo 'export PATH=/usr/local/go/bin:$PATH' | sudo tee /etc/profile.d/go.sh
source /etc/profile.d/go.sh
go version
```

Make sure Jenkins can see Go and Node:

```bash
sudo systemctl restart jenkins
sudo su - jenkins -s /bin/bash
go version
node -v
npm -v
exit
```

If `go` or `node` is not found for the `jenkins` user, add them to the Jenkins service environment or install them in a standard system path.

## 6. Install Jenkins plugins

In Jenkins:

1. Go to `Manage Jenkins`
2. Open `Plugins`
3. Install these plugins

Required:

- `Pipeline`
- `Git`
- `Credentials Binding`
- `SonarQube Scanner`

Recommended:

- `Pipeline: Stage View`
- `Warnings Next Generation`

Restart Jenkins after plugin installation.

## 7. Install and configure SonarQube

The simplest option is to run SonarQube in Docker on the same EC2 machine.

Install Docker:

```bash
sudo dnf install -y docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker jenkins
sudo usermod -aG docker ec2-user
sudo systemctl restart jenkins
```

Run SonarQube:

```bash
docker run -d \
  --name sonarqube \
  -p 9000:9000 \
  sonarqube:lts-community
```

Open SonarQube:

```text
http://<EC2-PUBLIC-IP>:9000
```

Default login:

- username: `admin`
- password: `admin`

Change the password on first login.

Then create a user token in SonarQube:

1. Log in to SonarQube
2. Open `My Account`
3. Open `Security`
4. Generate a token
5. Copy it once and store it safely

## 8. Configure SonarQube in Jenkins

In Jenkins:

1. Go to `Manage Jenkins`
2. Open `System`
3. Find `SonarQube servers`
4. Add a server

Use:

- Name: `sonarqube`
- Server URL: `http://<EC2-PUBLIC-IP>:9000`
- Server authentication token: add the token you created

The server name must match the default parameter in `jenkins/Jenkinsfile.testing`:

- `SONARQUBE_SERVER=sonarqube`

## 9. Configure SonarScanner tool in Jenkins

In Jenkins:

1. Go to `Manage Jenkins`
2. Open `Tools`
3. Find `SonarQube Scanner`
4. Add a scanner installation

Use:

- Name: `sonar-scanner`

This name must match the pipeline:

- `SCANNER_HOME = tool 'sonar-scanner'`

## 10. Create GitHub credentials in Jenkins

The pipeline expects this credential ID:

- `github-pat`

Create it in Jenkins:

1. Go to `Manage Jenkins`
2. Open `Credentials`
3. Add credentials

If the repo is private, use one of these:

- `Username with password`
- `Secret text`

Use this exact ID:

- `github-pat`

## 11. Create the Jenkins pipeline job

In Jenkins:

1. Click `New Item`
2. Enter job name, for example `arealis-zord-testing`
3. Select `Pipeline`
4. Click `OK`

Under pipeline configuration:

1. Choose `Pipeline script from SCM`
2. SCM: `Git`
3. Repository URL: your repo URL
4. Credentials: `github-pat`
5. Branch Specifier: `*/main`
6. Script Path: `jenkins/Jenkinsfile.testing`

Save the job.

## 12. Set SonarQube webhook for Quality Gate

This step is required because the pipeline uses:

- `waitForQualityGate abortPipeline: true`

In SonarQube:

1. Open `Administration`
2. Open `Configuration`
3. Open `Webhooks`
4. Add webhook

Use this URL:

```text
http://<EC2-PUBLIC-IP>:8080/sonarqube-webhook/
```

The trailing slash is important.

## 13. First pipeline run

Run the Jenkins job and use these parameters:

- `BRANCH_NAME=main`
- `GIT_CREDENTIALS_ID=github-pat`
- `SONARQUBE_SERVER=sonarqube`
- `SONAR_PROJECT_NAME=frontend`
- `SONAR_PROJECT_KEY=frontend`

If you want the SonarQube project to represent the whole repo instead of just the frontend label, change both values to something like:

- `SONAR_PROJECT_NAME=arealis-zord`
- `SONAR_PROJECT_KEY=arealis-zord`

## 14. What to expect on the first run

The pipeline will:

1. Clone the repository
2. Run `go test ./...` inside the backend Go modules
3. Run `npm ci`, `npm run lint`, and `npm run build` inside `backend/zord-console`
4. Submit analysis to SonarQube
5. Wait for the Quality Gate result

Current repository note:

- There are no Go `*_test.go` files in the repo right now, so the Go test stage is mainly a compile and package test check at the moment.

## 15. Common failure cases

### `go: command not found`

Fix:

- Confirm Go is installed system-wide
- Confirm Jenkins service can read `/usr/local/go/bin`
- Restart Jenkins after installing Go

### `node: command not found` or `npm: command not found`

Fix:

- Install Node.js 20 system-wide
- Restart Jenkins

### `sonar-scanner: not found`

Fix:

- Configure `SonarQube Scanner` under Jenkins tools
- Make sure the tool name is `sonar-scanner`

### `No such property: SONARQUBE_SERVER`

Fix:

- Use the job parameter named `SONARQUBE_SERVER`
- Keep the default value `sonarqube` unless you renamed the Jenkins Sonar server

### Quality Gate hangs forever

Fix:

- Configure the SonarQube webhook
- Verify this exact URL works:
  `http://<EC2-PUBLIC-IP>:8080/sonarqube-webhook/`

### Frontend build fails in `backend/zord-console`

Fix:

- Run the same commands manually on EC2:

```bash
cd /var/lib/jenkins/workspace/<job-name>/backend/zord-console
npm ci
npm run lint
npm run build
```

### Go test fails in one service

Fix:

- Run manually inside the failing module:

```bash
cd /var/lib/jenkins/workspace/<job-name>/backend/<service-name>
go test ./...
```

## 16. Recommended next step

After the first successful run, add a webhook from GitHub to Jenkins or use multibranch pipelines so tests run automatically on every push.

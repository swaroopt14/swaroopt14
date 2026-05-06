#!/bin/bash
set -euo pipefail

exec > >(tee /var/log/tool-bootstrap.log | logger -t tool-bootstrap -s 2>/dev/console) 2>&1
trap 'echo "Bootstrap failed at line ${LINENO}: ${BASH_COMMAND}"' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JENKINS_IMAGE_NAME="arealis-jenkins:lts-tools"
JENKINS_DOCKERFILE_TMP="/tmp/arealis-jenkins.Dockerfile"

WARNINGS=()

warn() {
  local message="$1"
  WARNINGS+=("${message}")
  echo "WARNING: ${message}"
}

is_container_running() {
  local container_name="$1"
  local status

  status="$(docker inspect -f '{{.State.Status}}' "${container_name}" 2>/dev/null || true)"
  [[ "${status}" == "running" ]]
}

wait_for_container_file() {
  local container_name="$1"
  local file_path="$2"
  local attempts="$3"
  local sleep_seconds="$4"

  for ((i = 1; i <= attempts; i++)); do
    if ! is_container_running "${container_name}"; then
      return 1
    fi

    if docker exec "${container_name}" test -f "${file_path}" >/dev/null 2>&1; then
      return 0
    fi

    sleep "${sleep_seconds}"
  done

  return 1
}

print_container_logs() {
  local container_name="$1"

  if docker ps -a --format '{{.Names}}' | grep -Fxq "${container_name}"; then
    echo "Last logs from ${container_name}:"
    docker logs --tail 50 "${container_name}" || true
  fi
}

get_public_ip() {
  local token

  token="$(curl -fsS -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" || true)"

  if [[ -n "${token}" ]]; then
    curl -fsS -H "X-aws-ec2-metadata-token: ${token}" \
      "http://169.254.169.254/latest/meta-data/public-ipv4" || true
  else
    curl -fsS "http://169.254.169.254/latest/meta-data/public-ipv4" || true
  fi
}

PUBLIC_IP="$(get_public_ip)"

echo "Starting admin instance bootstrap"

#----------------------------- Update system -----------------------------

yum update -y
yum install -y unzip git

if ! command -v curl >/dev/null 2>&1; then
  yum install -y curl-minimal
fi

#----------------------------- Install kubectl -----------------------------

curl -LO "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
mv kubectl /usr/local/bin/

kubectl version --client

#----------------------------- Install eksctl -----------------------------

curl --silent --location \
  "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" \
  | tar xz -C /tmp
mv /tmp/eksctl /usr/local/bin/

eksctl version

#----------------------------- Install Helm -----------------------------

curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version

#----------------------------- Install AWS CLI -----------------------------

curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install --update
rm -rf awscliv2.zip aws

aws --version

#----------------------------- Install Docker -----------------------------

yum install -y docker
systemctl enable --now docker

usermod -aG docker ec2-user || true
chmod 666 /var/run/docker.sock
docker --version

#----------------------------- Install Jenkins -----------------------------

docker volume create jenkins_home
docker rm -f jenkins >/dev/null 2>&1 || true

echo "Building custom Jenkins image with AWS CLI, Docker CLI, and Git"
cat > "${JENKINS_DOCKERFILE_TMP}" <<'EOF'
FROM jenkins/jenkins:lts

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        awscli \
        docker.io \
        git \
        unzip \
    && docker --version \
    && aws --version \
    && git --version \
    && rm -rf /var/lib/apt/lists/*

USER jenkins
EOF

docker build -t "${JENKINS_IMAGE_NAME}" -f "${JENKINS_DOCKERFILE_TMP}" /tmp
rm -f "${JENKINS_DOCKERFILE_TMP}"

if docker run -d \
  --name jenkins \
  --restart unless-stopped \
  -p 7777:8080 \
  -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  "${JENKINS_IMAGE_NAME}"; then
  echo "Waiting for Jenkins initial admin password"

  if wait_for_container_file "jenkins" "/var/jenkins_home/secrets/initialAdminPassword" 30 10; then
    docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword \
      | tee /home/ec2-user/jenkins-initial-admin-password
    chown ec2-user:ec2-user /home/ec2-user/jenkins-initial-admin-password
  else
    warn "Jenkins started but the initial admin password was not created in time."
    print_container_logs "jenkins"
  fi
else
  warn "Jenkins container failed to start."
  print_container_logs "jenkins"
fi

#----------------------------- Install SonarQube -----------------------------

tee /etc/sysctl.d/99-sonarqube.conf > /dev/null <<'EOF'
vm.max_map_count=524288
fs.file-max=131072
EOF

sysctl --system

docker volume create sonarqube_data
docker volume create sonarqube_logs
docker volume create sonarqube_extensions
docker rm -f sonarqube >/dev/null 2>&1 || true

if docker run -d \
  --name sonarqube \
  --restart unless-stopped \
  -p 7771:9000 \
  -v sonarqube_data:/opt/sonarqube/data \
  -v sonarqube_logs:/opt/sonarqube/logs \
  -v sonarqube_extensions:/opt/sonarqube/extensions \
  sonarqube:community; then
  sleep 20
  if ! is_container_running "sonarqube"; then
    warn "SonarQube container exited during startup."
    print_container_logs "sonarqube"
  fi
else
  warn "SonarQube container failed to start."
  print_container_logs "sonarqube"
fi

#----------------------------- Helm Repo -----------------------------

helm repo add autoscaler https://kubernetes.github.io/autoscaler
helm repo update

#----------------------------- Done -----------------------------

echo "Bootstrap complete"
echo "Jenkins: http://${PUBLIC_IP:-<ec2-public-ip>}:7777"
echo "SonarQube: http://${PUBLIC_IP:-<ec2-public-ip>}:7771"

if [[ -f /home/ec2-user/jenkins-initial-admin-password ]]; then
  echo "Jenkins password saved at /home/ec2-user/jenkins-initial-admin-password"
else
  warn "Jenkins password file was not created."
fi

if ((${#WARNINGS[@]} > 0)); then
  echo "Bootstrap completed with warnings:"
  for warning in "${WARNINGS[@]}"; do
    echo " - ${warning}"
  done
else
  echo "Bootstrap completed without warnings."
fi

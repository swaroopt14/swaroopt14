#!/usr/bin/env bash
set -euo pipefail

# Bootstrap for Amazon Linux 2 / Amazon Linux 2023
# Installs: Docker Engine, Docker Compose v2, Git, curl, jq, Java, Jenkins
# Configures Jenkins to run Docker (adds jenkins user to docker group).

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

PKG_MGR=""
if command -v dnf >/dev/null 2>&1; then
  PKG_MGR="dnf"
elif command -v yum >/dev/null 2>&1; then
  PKG_MGR="yum"
else
  echo "No supported package manager found (dnf/yum)."
  exit 1
fi

echo "[1/7] Update system packages"
"${PKG_MGR}" -y update

echo "[2/7] Install base tools"
if [[ "${PKG_MGR}" == "dnf" ]]; then
  # Amazon Linux 2023 uses curl-minimal by default; installing full curl often conflicts.
  dnf -y install --allowerasing git curl-minimal jq unzip ca-certificates shadow-utils
else
  yum -y install git curl jq unzip ca-certificates shadow-utils
fi

echo "[3/7] Install Docker"
if [[ "${PKG_MGR}" == "yum" ]]; then
  # Amazon Linux 2
  amazon-linux-extras install -y docker || true
  yum -y install docker
else
  # Amazon Linux 2023
  dnf -y install docker
fi

systemctl enable docker
systemctl start docker

# Allow ec2-user to run docker without sudo (optional, but convenient)
if id ec2-user >/dev/null 2>&1; then
  usermod -aG docker ec2-user || true
fi

echo "[4/7] Install Docker Compose v2 (plugin)"
mkdir -p /usr/local/lib/docker/cli-plugins
COMPOSE_VERSION="v2.27.0"
ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64) COMPOSE_ARCH="x86_64" ;;
  aarch64|arm64) COMPOSE_ARCH="aarch64" ;;
  *)
    echo "Unsupported arch: ${ARCH}"
    exit 1
    ;;
esac

curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
  "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}"
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

docker compose version

echo "[5/7] Install Java (Jenkins requirement)"
if [[ "${PKG_MGR}" == "yum" ]]; then
  yum -y install java-17-amazon-corretto
else
  dnf -y install java-17-amazon-corretto
fi

echo "[6/7] Install Jenkins"
# Use the official repo file so key rotations don't break installs.
curl -fsSL -o /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo

# Import the GPG key(s) referenced by the repo file (may be multiple URLs).
mkdir -p /etc/pki/rpm-gpg
GPG_KEYS="$(
  awk -F= '/^[[:space:]]*gpgkey[[:space:]]*=/{print $2}' /etc/yum.repos.d/jenkins.repo \
    | tr ' ' '\n' \
    | sed '/^[[:space:]]*$/d'
)"

if [[ -z "${GPG_KEYS}" ]]; then
  echo "Could not find gpgkey= in /etc/yum.repos.d/jenkins.repo"
  exit 1
fi

while read -r key_url; do
  [[ -z "${key_url}" ]] && continue
  key_file="/etc/pki/rpm-gpg/$(basename "${key_url}")"
  curl -fsSL -o "${key_file}" "${key_url}"
  rpm --import "${key_file}"
done <<< "${GPG_KEYS}"

"${PKG_MGR}" clean all || true
"${PKG_MGR}" -y install jenkins
systemctl enable jenkins
systemctl start jenkins

echo "[7/7] Allow Jenkins to run Docker"
usermod -aG docker jenkins || true
systemctl restart jenkins

echo ""
echo "Installed:"
echo "- Docker: $(docker --version)"
echo "- Compose: $(docker compose version | head -n 1)"
echo "- Jenkins: running on port 8080"
echo ""
echo "Jenkins initial admin password:"
if [[ -f /var/lib/jenkins/secrets/initialAdminPassword ]]; then
  cat /var/lib/jenkins/secrets/initialAdminPassword
else
  echo "(not found yet; Jenkins may still be starting)"
fi

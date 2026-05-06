#!/usr/bin/env bash
set -euo pipefail

missing=0

require_command() {
  local command_name="$1"
  local install_hint="$2"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    echo "${install_hint}" >&2
    missing=1
    return
  fi

  echo "${command_name}: $(${command_name} --version 2>&1 | head -n 1)"
}

require_command bash "Install bash on the Jenkins agent."
require_command git "Install git on the Jenkins agent."
require_command aws "Install AWS CLI on the Jenkins agent or use the custom Jenkins image from ools/tools.sh."
require_command docker "Install Docker CLI on the Jenkins agent or rebuild Jenkins with the custom image from ools/tools.sh."

if ((missing != 0)); then
  echo "Jenkins runtime verification failed." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Docker CLI is installed, but Jenkins cannot reach the Docker daemon.
Fix one of these before running the pipeline:
- Mount /var/run/docker.sock into the Jenkins container.
- Make sure the Jenkins user can read and write the Docker socket.
- If Jenkins is not containerized, start Docker on the Jenkins agent.
EOF
  exit 1
fi

echo "Docker daemon is reachable from Jenkins."

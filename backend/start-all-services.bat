@echo off
setlocal

cd /d "%~dp0"
echo Starting all Zord backend services from %CD%
echo.

for %%d in (
  zord-relay
  zord-edge
  zord-intent-engine
  zord-token-enclave
  zord-outcome-engine
  zord-evidence
  zord-intelligence
  zord-prompt-layer
  zord-console
) do (
  echo === up: %%d ===
  if exist "%%d\docker-compose.yml" (
    pushd "%%d"
    docker compose up -d
    popd
  ) else if exist "%%d\docker-compose.yaml" (
    pushd "%%d"
    docker compose up -d
    popd
  ) else (
    echo SKIP: %%d ^(no docker-compose file^)
  )
  echo.
)

echo All services started.

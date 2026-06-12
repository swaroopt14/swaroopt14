@echo off
setlocal

cd /d "%~dp0"
echo Stopping all Zord backend services from %CD%
echo.

for %%d in (
  zord-console
  zord-prompt-layer
  zord-intelligence
  zord-evidence
  zord-outcome-engine
  zord-token-enclave
  zord-intent-engine
  zord-edge
  zord-relay
) do (
  echo === down: %%d ===
  if exist "%%d\docker-compose.yml" (
    pushd "%%d"
    docker compose down
    popd
  ) else if exist "%%d\docker-compose.yaml" (
    pushd "%%d"
    docker compose down
    popd
  ) else (
    echo SKIP: %%d ^(no docker-compose file^)
  )
  echo.
)

echo All services stopped.

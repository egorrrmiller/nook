#!/usr/bin/env bash
# Boots the API briefly on a spare port and writes backend/openapi.json (consumed by `pnpm gen:api` in frontend/).
# Requires a reachable PostgreSQL (NOOK_DB / .env); migrations are applied automatically.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${OPENAPI_PORT:-5999}"
OUT="${1:-openapi.json}"
export ASPNETCORE_ENVIRONMENT="${ASPNETCORE_ENVIRONMENT:-Development}"
export ASPNETCORE_URLS="http://127.0.0.1:${PORT}"
export NOOK_BACKGROUND_JOBS=false

dotnet build src/Nook.Api -c Release -m:1 -v q </dev/null
dotnet run --project src/Nook.Api -c Release --no-build --no-launch-profile </dev/null >/tmp/nook-openapi.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

curl -fsS "http://127.0.0.1:${PORT}/openapi/v1.json" | python3 -m json.tool > "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"

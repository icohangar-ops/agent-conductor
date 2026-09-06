#!/usr/bin/env bash
# Build MCPB for agent-conductor (Node 23+; decision_* needs Python + consensus-hardening-protocol on host).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
OUT="dist/agent-conductor-${VERSION}.mcpb"
STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT

echo "==> install (incl. dev deps for tsc)"
npm ci --no-audit --no-fund

echo "==> build"
npm run build

echo "==> production deps only"
npm ci --omit=dev --no-audit --no-fund

echo "==> stage"
cp mcpb/manifest.json "${STAGE}/manifest.json"
cp package.json package-lock.json LICENSE README.md "${STAGE}/"
cp -R dist engine node_modules "${STAGE}/"

echo "==> validate"
mcpb validate "${STAGE}/manifest.json"

echo "==> pack -> ${OUT}"
mkdir -p dist
mcpb pack "${STAGE}" "${OUT}"

echo "==> smoke (tools/list; no Python spawn)"
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mcpb-pack-smoke","version":"0.0.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| node dist/index.js > /tmp/agent-conductor-mcpb-smoke.ndjson
grep -q '"name":"agent-conductor"' /tmp/agent-conductor-mcpb-smoke.ndjson
grep -q 'contract_load' /tmp/agent-conductor-mcpb-smoke.ndjson
echo "OK: ${OUT} ($(du -h "${OUT}" | cut -f1))"
echo "Note: decision_* tools need: pip install -r engine/requirements.txt"

echo
echo "Smithery: smithery auth login && npm run smithery:publish"

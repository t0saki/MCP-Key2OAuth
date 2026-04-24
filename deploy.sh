#!/bin/bash
set -e

echo "Creating KV namespaces..."

OAUTH_KV_ID=$(npx wrangler kv namespace create OAUTH_KV --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
SLUG_KV_ID=$(npx wrangler kv namespace create SLUG_KV --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

if [ -n "$OAUTH_KV_ID" ] && [ -n "$SLUG_KV_ID" ]; then
  echo "OAUTH_KV namespace ID: $OAUTH_KV_ID"
  echo "SLUG_KV namespace ID: $SLUG_KV_ID"

  # Update wrangler.jsonc with real IDs
  sed -i.bak "s/PLACEHOLDER_OAUTH_KV_ID/$OAUTH_KV_ID/g" wrangler.jsonc
  sed -i.bak "s/PLACEHOLDER_SLUG_KV_ID/$SLUG_KV_ID/g" wrangler.jsonc
  rm -f wrangler.jsonc.bak
else
  echo "KV namespaces may already exist, attempting deploy with existing config..."
fi

echo "Deploying worker..."
npx wrangler deploy

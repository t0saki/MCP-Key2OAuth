#!/bin/bash
set -e

echo "Creating KV namespaces..."

# Create KV namespaces and extract IDs from text output
OAUTH_KV_OUTPUT=$(npx wrangler kv namespace create OAUTH_KV 2>&1 || true)
OAUTH_KV_ID=$(echo "$OAUTH_KV_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)

SLUG_KV_OUTPUT=$(npx wrangler kv namespace create SLUG_KV 2>&1 || true)
SLUG_KV_ID=$(echo "$SLUG_KV_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$OAUTH_KV_ID" ] && [ -n "$SLUG_KV_ID" ]; then
  echo "OAUTH_KV ID: $OAUTH_KV_ID"
  echo "SLUG_KV ID: $SLUG_KV_ID"
  sed -i "s/PLACEHOLDER_OAUTH_KV_ID/$OAUTH_KV_ID/g" wrangler.jsonc
  sed -i "s/PLACEHOLDER_SLUG_KV_ID/$SLUG_KV_ID/g" wrangler.jsonc
else
  echo "Warning: Could not create KV namespaces automatically."
  echo "Please create them manually and update wrangler.jsonc."
  echo "OAUTH_KV output: $OAUTH_KV_OUTPUT"
  echo "SLUG_KV output: $SLUG_KV_OUTPUT"
  exit 1
fi

echo "Deploying worker..."
npx wrangler deploy

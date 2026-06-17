#!/usr/bin/env bash
# ABOUTME: Starts a local Temporal dev server for the priority/fairness demo and ensures search attributes.
# Enables fairness (required); priority works by default on server 1.31+ (new matcher is on by default).
set -euo pipefail

cd "$(dirname "$0")"

ADDRESS=${TEMPORAL_ADDRESS:-localhost:7233}
NAMESPACE=${TEMPORAL_NAMESPACE:-default}

# Fairness must be explicitly enabled. Priority/new-matcher is default-on in server 1.31+,
# so matching.useNewMatcher is no longer required (kept here, set true, only for older servers).
temporal server start-dev \
  --dynamic-config-value matching.enableFairness=true \
  --dynamic-config-value matching.useNewMatcher=true &
SERVER_PID=$!

# Make Ctrl-C (or any exit) also stop the dev server we backgrounded.
trap 'echo; echo "Stopping Temporal dev server..."; kill "$SERVER_PID" 2>/dev/null || true' INT TERM EXIT

# Wait for the server to come up before creating search attributes.
echo "Waiting for Temporal server at ${ADDRESS}..."
for _ in $(seq 1 30); do
  if temporal --address "$ADDRESS" operator cluster health >/dev/null 2>&1; then
    echo "Temporal server is healthy."
    break
  fi
  sleep 1
done

# Ensure the demo's required search attributes exist (dev server state is in-memory, so do this every start).
TEMPORAL_ADDRESS="$ADDRESS" TEMPORAL_NAMESPACE="$NAMESPACE" ./createlocalsearchattributes.sh

echo
echo "Temporal dev server running (PID ${SERVER_PID}). UI: http://localhost:8233  gRPC: ${ADDRESS}"
echo "Press Ctrl-C to stop."

# Keep this script attached to the server process so the trap cleans up on exit.
wait "$SERVER_PID"

#!/usr/bin/env bash
# Be tolerant to failures; keep going per attribute
set -uo pipefail

# Creates/ensures required search attributes in Temporal Cloud using tcld.
# Requires: TEMPORAL_NAMESPACE env var set and 'tcld' CLI installed/authenticated.

NAMESPACE=${TEMPORAL_NAMESPACE:-}
if [ -z "${NAMESPACE}" ]; then
  echo "Error: TEMPORAL_NAMESPACE is not set." >&2
  echo "Export it first, e.g.: export TEMPORAL_NAMESPACE=your-namespace" >&2
  exit 1
fi

if ! command -v tcld >/dev/null 2>&1; then
  echo "Error: 'tcld' CLI not found in PATH. Please install and authenticate 'tcld'." >&2
  exit 1
fi

# Prefer API key auth if available (global tcld flag)
TCLD_CMD=("tcld")
if [ -n "${TEMPORAL_CLOUD_API_KEY:-}" ]; then
  echo "Using TEMPORAL_CLOUD_API_KEY for tcld authentication." >&2
  TCLD_CMD+=("--api-key" "$TEMPORAL_CLOUD_API_KEY")
elif [ -n "${TCLD_API_KEY:-}" ]; then
  echo "Using TCLD_API_KEY for tcld authentication." >&2
  TCLD_CMD+=("--api-key" "$TCLD_API_KEY")
fi

# Soft auth check (non-fatal): try to list namespaces
if ! pref_out=$("${TCLD_CMD[@]}" namespace list 2>&1); then
  if echo "$pref_out" | grep -qi 'Unauthenticated'; then
    echo "Warning: tcld appears unauthenticated (request not authenticated). Attempting operations anyway..." >&2
  else
    echo "Warning: 'tcld namespace list' failed: $pref_out" >&2
  fi
fi

add_sa() {
  local spec="$1" # e.g. "Priority=Int"
  echo "Ensuring search attribute '$spec' in namespace '$NAMESPACE'..."
  set +e
  output=$("${TCLD_CMD[@]}" namespace search-attributes add \
    --namespace "$NAMESPACE" \
    --search-attribute "$spec" 2>&1)
  status=$?
  set -e
  if [ $status -eq 0 ]; then
    echo "Added '$spec'."
  else
    # Tolerate already exists responses
    if echo "$output" | grep -qiE 'already|exists|ALREADY_EXISTS'; then
      echo "'$spec' already exists. Skipping."
    else
      if echo "$output" | grep -qi 'Unauthenticated'; then
        echo "Warning: Unauthenticated when adding '$spec'. Try 'tcld login' or set TEMPORAL_CLOUD_API_KEY." >&2
      elif echo "$output" | grep -qi 'not in active state'; then
        echo "Warning: Namespace not active; could not add '$spec'." >&2
      else
        echo "Warning: Failed to add '$spec': $output" >&2
      fi
    fi
  fi
}

add_sa "ActivitiesCompleted=Int"
add_sa "FairnessKey=Keyword"
add_sa "FairnessWeight=Int"
add_sa "Priority=Int"

echo "Completed search attribute create attempts for namespace '$NAMESPACE'."

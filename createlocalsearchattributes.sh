#!/usr/bin/env bash
set -euo pipefail

# Creates/ensures required search attributes for the demo.
# Defaults: address=localhost:7233, namespace=default

ADDRESS=${TEMPORAL_ADDRESS:-localhost:7233}
NAMESPACE=${TEMPORAL_NAMESPACE:-default}

if ! command -v temporal >/dev/null 2>&1; then
  echo "Error: 'temporal' CLI not found in PATH. Please install Temporal CLI." >&2
  exit 1
fi

create_sa() {
  local name="$1"
  local type="$2"
  echo "Ensuring search attribute '$name' (type=$type) in namespace '$NAMESPACE' at '$ADDRESS'..."
  set +e
  output=$(temporal --address "$ADDRESS" --namespace "$NAMESPACE" operator search-attribute create --name "$name" --type "$type" 2>&1)
  status=$?
  set -e
  if [ $status -eq 0 ]; then
    echo "Created '$name'."
  else
    # Tolerate already exists
    if echo "$output" | grep -qiE 'already exists|ALREADY_EXISTS'; then
      echo "'$name' already exists. Skipping."
    else
      echo "Failed to create '$name': $output" >&2
      exit $status
    fi
  fi
}

create_sa "ActivitiesCompleted" "int"
create_sa "FairnessKey" "keyword"
create_sa "FairnessWeight" "int"
create_sa "Priority" "int"

echo "All required search attributes ensured."


#!/bin/bash
#
# Start the Python worker against Temporal Cloud using a Temporal env (config) profile.
# Connection details come from your Temporal client config file (the profile selected
# by TEMPORAL_PROFILE), loaded by priority_fairness.config via Temporal envconfig.
#
# Usage:
#   ./scripts/startcloudworker.sh [profile]
#
# If a profile name is passed it is exported as TEMPORAL_PROFILE. Otherwise the
# already-exported TEMPORAL_PROFILE is used. The "default" profile applies if neither
# is set, but for cloud you almost always want a named profile, so we warn in that case.
# Run from the python/ directory.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "${1:-}" ]; then
  export TEMPORAL_PROFILE="$1"
fi

if [ -z "${TEMPORAL_PROFILE:-}" ]; then
  echo "No profile supplied and TEMPORAL_PROFILE is not set." >&2
  echo "Pass a profile name (./scripts/startcloudworker.sh <profile>) or export" >&2
  echo "TEMPORAL_PROFILE so the worker can find your Temporal Cloud connection settings." >&2
  exit 1
fi

echo "Starting cloud worker with TEMPORAL_PROFILE=${TEMPORAL_PROFILE}"
exec uv run python -m priority_fairness.worker

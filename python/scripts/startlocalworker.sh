#!/bin/bash
#
# Start the Python worker against a locally running Temporal dev server.
# Run from the python/ directory.

set -euo pipefail
cd "$(dirname "$0")/.."
exec uv run python -m priority_fairness.worker

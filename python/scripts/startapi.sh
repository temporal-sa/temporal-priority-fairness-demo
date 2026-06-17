#!/bin/bash
#
# Start the FastAPI app that the React UI calls. Listens on port 7080.
# Run from the python/ directory.

set -euo pipefail
cd "$(dirname "$0")/.."
exec uv run uvicorn priority_fairness.api:app --port 7080

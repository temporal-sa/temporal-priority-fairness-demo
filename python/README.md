# Priority / Fairness demo: Python backend

A Python port of the Temporal priority and fairness demo. It replaces the Java
Spring Boot backend with a Temporal worker plus a FastAPI service. The React UI in
`ui/` is unchanged: this backend serves the exact same HTTP contract the UI already
expects, so the two are interchangeable.

The Java backend and all root-level scripts are left in place. Everything here is
additive under `python/`.

## Layout

```
python/
  src/priority_fairness/   package: models, domain, search_attributes,
                           activities, workflows, config, worker, api
  scripts/                 run scripts (local worker, API, cloud worker)
  tests/                   hermetic test suite (no live server needed)
  pyproject.toml           deps, ruff, mypy (strict), pytest config
  justfile                 just check / just test / just all
```

## Requirements

- Python 3.14 (the project pins `requires-python = ">=3.14"`; tooling targets `py314`).
- [uv](https://docs.astral.sh/uv/) for dependency management and running commands.
- The Temporal CLI for the local dev server and for cloud env profiles.

`temporalio[pydantic]`, `fastapi`, `uvicorn`, and `pydantic` all resolve and install
on Python 3.14: the suite was developed against `temporalio` 1.28.0 on CPython 3.14.5.

Install dependencies once:

```bash
cd python
uv sync
```

## Local run (four terminals)

The dev server and the search-attribute creation are language-agnostic and reuse the
existing root-level scripts. Run each command in its own terminal.

1. Temporal dev server (from the repo root):

   ```bash
   ./startlocalserver.sh
   ```

   This also registers the search attributes the demo needs
   (`Priority`, `ActivitiesCompleted`, `FairnessKey`, `FairnessWeight`). If you start
   the server some other way, run `./createlocalsearchattributes.sh` once.

2. Python worker (from `python/`):

   ```bash
   ./scripts/startlocalworker.sh
   ```

3. FastAPI service on port 7080 (from `python/`):

   ```bash
   ./scripts/startapi.sh
   ```

4. React UI (from `ui/`):

   ```bash
   ./startwebui.sh
   ```

The UI runs at `https://localhost:4000`, which is the only origin the API's CORS
policy allows.

## Cloud run

For Temporal Cloud the connection details come from a Temporal client config profile,
loaded through Temporal envconfig. Set up a profile with the CLI (target host,
namespace, mTLS or API key), then point the worker at it with `TEMPORAL_PROFILE`:

```bash
cd python
./scripts/startcloudworker.sh <profile-name>
```

The script exports `TEMPORAL_PROFILE` and runs the worker; `config.py` loads that
profile via `ClientConfig.load_client_connect_config` and always attaches the Pydantic
data converter. You can also export `TEMPORAL_PROFILE` yourself and run the script with
no argument. The same profile resolution applies to the API process, so set the env var
before launching `./scripts/startapi.sh` against cloud.

Register the cloud search attributes once with the root-level
`./createcloudsearchattributes.sh`.

## HTTP contract (frozen)

The React UI depends on these shapes exactly, so they match the Java backend
field-for-field. JSON is camelCase on the wire; internal Python attributes are
snake_case (Pydantic aliases bridge the two).

- `POST /start-workflows` accepts a `WorkflowConfig` body (`workflowIdPrefix`,
  `numberOfWorkflows`, `mode`, `disableFairness`, `bands`) and returns the plain-text
  body `Done`. `mode: "fairness"` runs the fairness path; anything else runs priority.
- `GET /run-status?runPrefix=...` returns `{ workflowsByPriority, totalWorkflowsInTest }`.
  `workflowsByPriority` always has five groups (priorities 1 through 5).
- `GET /run-status-fairness?runPrefix=...` returns
  `{ workflowsByFairness, totalWorkflowsInTest }`, with groups sorted by weight
  descending then key ascending.

## Development

All commands run from `python/`:

```bash
just check   # ruff check + mypy (strict)
just test    # pytest
just all     # fmt + check + test
```

The test suite is hermetic. It uses Temporal's time-skipping environment and a fake
client, so no live server is required to run it.

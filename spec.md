# Spec: Python port of the Temporal Priority/Fairness demo

## Goal

Port the Java (Spring Boot) backend of this demo to Python while following Temporal
and Python best practices. The port is a faithful behavioral copy of the Java app:
same demo mechanics, same HTTP API the React UI already consumes, same Temporal
task-queue topology and search attributes. The existing React UI in `ui/` is not
changed and must keep working against the Python backend with zero edits.

This document is the input to `/bpe:plan`. It is written so the work can be broken
into test-first, independently implementable components.

## Decisions captured during brainstorm

1. Web framework: FastAPI.
2. API contract: frozen. Endpoints, query params, and response JSON match the Java
   app field-for-field so the React UI works unchanged. Pydantic models mirror the
   Java aggregates exactly (camelCase JSON via field aliases), served on port 7080.
3. Process topology: two processes. A worker process hosts the workflows/activities
   and polls the task queues; a separate FastAPI process acts as a Temporal client
   only (starts workflows, lists executions).
4. Worker topology: replicate the Java topology exactly. Three `Worker` instances run
   concurrently in the worker process via `asyncio.gather`, across the same three task
   queues, with `max_concurrent_activities=5` as the bottleneck. Activities are async
   and sleep with `await asyncio.sleep(0.3)`.
5. Payloads: Pydantic everywhere. Use `temporalio.contrib.pydantic.pydantic_data_converter`
   so the same Pydantic models serve as FastAPI request/response bodies and as Temporal
   workflow/activity payloads. Bring the models through the workflow sandbox with
   `workflow.unsafe.imports_passed_through()`.
6. Connection config: `temporalio.envconfig` (`ClientConfig.load_client_connect_config`).
   One code path for local dev server and Temporal Cloud, selected by profile and/or
   `TEMPORAL_*` env vars. Handles TLS / API key for Cloud.
7. Repo layout: Python lives in a subdirectory; the Java code stays in place. Both
   backends coexist on this branch.
8. Test strategy: pure unit tests for the business logic, workflow/activity tests with
   the Temporal time-skipping `WorkflowEnvironment`, and FastAPI route tests with a
   mocked Temporal client. The suite is hermetic; no live dev server required.

## Repo layout

New Python project under `python/` at the repo root. The Java tree, `ui/`, `docs/`,
`assets/`, and the language-agnostic helper scripts are untouched.

```
python/
  pyproject.toml
  README.md
  justfile                  # task runner (fmt / check / test)
  noxfile.py                # optional multi-version test automation
  src/
    priority_fairness/
      __init__.py
      config.py             # envconfig loading -> Client
      constants.py          # task queue names, SA keys, defaults
      models.py             # Pydantic models (payloads + API bodies)
      domain.py             # PURE business logic (the TDD core)
      search_attributes.py  # typed SA definitions + read/parse helpers
      activities.py         # priority_activity, fairness_activity
      workflows.py          # PriorityWorkflow, FairnessWorkflow
      worker.py             # builds + runs the 3 workers (entry point)
      api.py                # FastAPI app (entry point, Temporal client)
  tests/
    conftest.py
    test_priority_rules.py
    test_fairness_rules.py
    test_delay_math.py
    test_aggregation.py
    test_workflows.py
    test_activities.py
    test_api.py
  scripts/
    startlocalworker.sh     # uv run python -m priority_fairness.worker
    startapi.sh             # uv run uvicorn priority_fairness.api:app --port 7080
    startcloudworker.sh     # profile-based cloud variant
```

Run scripts disambiguate which backend is active. The existing root-level
`createlocalsearchattributes.sh`, `createcloudsearchattributes.sh`, and
`startlocalserver.sh` are language-agnostic (they use the `temporal`/`tcld` CLIs) and
are reused as-is. `startlocalserver.sh` already enables `matching.enableFairness=true`
and creates the four search attributes on each start.

## Tooling

Per the Python standards skill:

- `uv` for dependency management and running. No `uv pip`.
- `ruff` for lint + format. `line-length = 120`, lint select `["E","F","I","UP","B","SIM"]`.
- `mypy --strict`.
- `pytest` + `pytest-asyncio` for tests; `httpx` for API tests.
- `nox` (optional) for multi-version runs; `just` as the task runner.
- Target Python 3.14 (must be a version with `temporalio` wheels; confirm wheel
  availability when pinning).

Runtime dependencies: `temporalio` (with the Pydantic extra so
`temporalio.contrib.pydantic` is available), `pydantic`, `fastapi`, `uvicorn`.

All modules start with the required 2-line `ABOUTME:` header comment. Strict type hints
throughout. Absolute imports. Empty `__init__.py`.

## Architecture

### Processes

- Worker process (`python -m priority_fairness.worker`): connects a `Client` with the
  Pydantic data converter, builds three `Worker`s, and runs them with `asyncio.gather`.
- API process (`uvicorn priority_fairness.api:app --port 7080`): on startup (FastAPI
  lifespan) connects a `Client` with the Pydantic data converter; routes use it to
  start workflows and list executions. No worker runs in this process.

Both connect via the same `config.py` helper so local/cloud behavior is identical.

### Task queues (replicate Java exactly)

| Task queue          | Hosts                         | Concurrency cap                 |
|---------------------|-------------------------------|---------------------------------|
| `PriorityWorkflowTQ`| `PriorityWorkflow` (workflow) | default                         |
| `PriorityActivityTQ`| `priority_activity`           | `max_concurrent_activities=5`   |
| `fairness-queue`    | `FairnessWorkflow` + `fairness_activity` | `max_concurrent_activities=5` |

The 5-activity cap is the demo's whole point: it creates the backlog that makes priority
ordering and fairness weighting observable. Priority mode deliberately splits workflow
and activity onto separate queues; fairness mode shares one queue. Keep the exact queue
names; the frozen contract and the search-attribute query depend only on workflow IDs,
not queue names, but faithful behavior depends on this split.

### Workflows

`PriorityWorkflow.run(data: PriorityWorkflowData) -> str`:
- Loops `counter` from 1 to 5.
- Each iteration executes `priority_activity` on `PriorityActivityTQ` with
  `start_to_close_timeout=timedelta(seconds=5)` and
  `priority=Priority(priority_key=data.priority)`.
- After each step, upserts the typed search attribute `ActivitiesCompleted = counter`.
- Returns `"Complete"`.

`FairnessWorkflow.run(data: FairnessWorkflowData) -> str`:
- Loops `counter` from 1 to 5.
- Each iteration executes `fairness_activity` on `fairness-queue` with
  `start_to_close_timeout=timedelta(seconds=5)`. If `data.disable_fairness` is False,
  pass `priority=Priority(fairness_key=data.fairness_key, fairness_weight=float(data.fairness_weight))`;
  if True, pass no priority.
- After each step, upserts `ActivitiesCompleted = counter`.
- Returns `"Complete"`.

Note: priority/fairness is set on the activity, not at workflow start (matching Java).
The workflow is started without a priority; the activity carries the priority/fairness
key onto the constrained queue.

Search-attribute upsert: use the typed search-attribute API
(`SearchAttributeKey.for_int("ActivitiesCompleted")` and
`workflow.upsert_search_attributes([...])`). Confirm the exact typed-update call shape
against the installed `temporalio` version during implementation.

### Activities

`priority_activity(data: PriorityActivityData) -> PriorityActivityData` and
`fairness_activity(data: FairnessActivityData) -> FairnessActivityData`:
- `await asyncio.sleep(0.3)`.
- Append `f"{now} - Activity step [{data.step_number}] completed"` to `data.results`.
- Return `data`.

The timestamp string is informational only (the UI reads progress from search
attributes, not from activity return values), so exact timestamp format is not part of
the frozen contract.

## Data models (Pydantic)

These models are both the FastAPI request/response bodies and the Temporal payloads.
JSON uses camelCase via field aliases / `model_config` so the wire format matches Java.
Internal Python attribute names are snake_case.

Request body and payloads:

- `Band`: `key: str`, `weight: int`, `count: int | None = None`.
- `WorkflowConfig`: `workflow_id_prefix: str` (alias `workflowIdPrefix`),
  `number_of_workflows: int = 100` (alias `numberOfWorkflows`),
  `mode: str | None = None`, `bands: list[Band] | None = None`,
  `disable_fairness: bool = False` (alias `disableFairness`). Ignore unknown fields.
- `PriorityWorkflowData`: `priority: int`.
- `FairnessWorkflowData`: `fairness_key: str`, `fairness_weight: int`, `disable_fairness: bool`.
- `PriorityActivityData`: `step_number: int`, `priority: int`, `results: list[str] = []`.
- `FairnessActivityData`: `step_number: int`, `fairness_key: str`, `fairness_weight: int`,
  `results: list[str] = []`.

Response models (camelCase JSON; see frozen contract appendix for exact shapes):

- `ActivitySummary`: `activityNumber: int`, `numberCompleted: int`.
- `WorkflowSummary`: `workflowPriority: int`, `numberOfWorkflows: int`,
  `activities: list[ActivitySummary]`.
- `PriorityTestRunResults`: `workflowsByPriority: list[WorkflowSummary]`,
  `totalWorkflowsInTest: int`.
- `FairnessSummary`: `fairnessKey: str`, `fairnessWeight: int`, `numberOfWorkflows: int`,
  `activities: list[ActivitySummary]`.
- `FairnessTestRunResults`: `workflowsByFairness: list[FairnessSummary]`,
  `totalWorkflowsInTest: int`.

## The TDD core: pure business logic (`domain.py`)

These functions hold all of the application logic worth testing. They are pure (no
Temporal client, no I/O, no clock except where injected) so they are written test-first.
Each has well-defined inputs and outputs.

### 1. Priority assignment

`assign_priority(workflow_num: int) -> int`
- Returns `((workflow_num - 1) % 5) + 1`.
- Workflow numbers are 1-based. Cycles 1,2,3,4,5,1,2,...
- Tests: n=1 -> 1; n=5 -> 5; n=6 -> 1; n=100 -> 5.

### 2. Default fairness bands

`default_fairness_bands() -> list[Band]`
- Returns `first-class` (15), `business-class` (5), `economy-class` (1), in that order.

### 3. Workflow-count resolution

`resolve_total_workflows(config: WorkflowConfig, bands: list[Band]) -> int`
- If any band has `count` set and > 0 (`has_counts`), return the sum of all band counts.
- Otherwise return `config.number_of_workflows`.

### 4. Fairness submission order

`build_submission_order(bands: list[Band], number_of_workflows: int, rng: Random) -> list[Band]`
- If `has_counts`: build a flat list repeating each band `count` times, then shuffle
  using the injected `rng`. Inject the RNG so shuffling is testable; production passes
  a default `Random()`.
- If not `has_counts`: assign by round-robin, band `i = (n - 1) % len(bands)` for n in
  1..`number_of_workflows`, producing a deterministic list (no shuffle).
- Tests: count expansion produces the right multiset; round-robin assigns the right band
  per index; a seeded RNG yields a stable shuffle.

### 5. Start-delay math

Two target-time helpers plus a per-workflow delay clamp. Time is injected as `now` so
they are pure.

`priority_target_offset_seconds(n: int) -> float`
- `n * 0.05 + 5`.

`fairness_target_offset_seconds(n: int) -> int`
- `clamp(ceil(0.15 * n - 15), 7, 30)`.
- Tests: n=100 -> 7 (floor); n=200 -> 15; n=300 -> 30; n=440 -> 30 (cap).

`start_delay(target: datetime, now: datetime) -> timedelta`
- `target - now`, clamped to `timedelta(0)` if negative.

The starter computes one target start time before the loop (target = now + offset), then
every workflow gets `start_delay(target, now_at_enqueue)` so they begin at roughly the
same instant. Later enqueues get a smaller delay; once the target passes, delay is zero.

### 6. Result aggregation (priority)

`aggregate_priority(executions: list[ExecutionView]) -> PriorityTestRunResults`
where `ExecutionView` is a small struct/dataclass `{priority: int, activities_completed: int}`
parsed from the listed executions' search attributes (parsing lives in
`search_attributes.py`; aggregation takes already-parsed views so it is pure and easy to
test with fabricated data).
- Initialize 5 groups for priorities 1..5, each `numberOfWorkflows = 0`, `activities = []`.
  Groups are always present even when empty (matches Java).
- For each execution: `group = groups[priority - 1]`; increment `numberOfWorkflows`; for
  `k` in 1..`activities_completed`, ensure an `ActivitySummary` exists at index `k-1`
  (`activityNumber = k`, `numberCompleted` starts at 1) else increment its
  `numberCompleted`.
- Result: `activities[i].numberCompleted` = number of workflows in that priority that
  completed at least `i+1` activity steps. `totalWorkflowsInTest` = number of executions.
- Tests: empty input -> 5 empty groups, total 0; a workflow at priority 3 with 4
  activities completed lands in group index 2 and contributes to activity steps 1..4.

### 7. Result aggregation (fairness)

`aggregate_fairness(executions: list[FairnessExecutionView]) -> FairnessTestRunResults`
where `FairnessExecutionView` is `{fairness_key: str, fairness_weight: int, activities_completed: int}`.
- Group by `(fairness_key, fairness_weight)`. A missing key parses to `""`, missing
  weight to `0`.
- Activity accumulation is identical to the priority case.
- Sort groups by `fairnessWeight` descending, then `fairnessKey` ascending (matches Java).
- `totalWorkflowsInTest` = number of executions.
- Tests: three default bands produce three groups sorted 15,5,1; `disable_fairness` runs
  (weight 0) collapse into a single weight-0 group; activity accumulation matches.

## Search attributes (`search_attributes.py`)

Typed search-attribute keys, identical to Java:

- `Priority` (int)
- `ActivitiesCompleted` (int)
- `FairnessKey` (keyword)
- `FairnessWeight` (int)

On workflow start the API sets the relevant keys (priority mode: `Priority`,
`ActivitiesCompleted=0`; fairness mode: `FairnessKey`, `FairnessWeight` (0 when
`disable_fairness`), `ActivitiesCompleted=0`). Workflows upsert `ActivitiesCompleted`
after each step.

Reading: `parse_priority_view(execution)` and `parse_fairness_view(execution)` convert a
listed execution's typed search attributes into the small `ExecutionView` structs the
aggregation functions consume. These parsers are unit-tested against fabricated
execution descriptions; the aggregation functions never touch the SDK types directly.

## HTTP API (`api.py`)

FastAPI app on port 7080. CORS allows `https://localhost:4000` for GET and POST. Routes
have no `/api` prefix (the Vite dev server proxies `/api/*` to `:7080` and strips the
prefix).

### POST `/start-workflows`

- Body: `WorkflowConfig` (JSON, camelCase).
- `mode`: null/empty/anything except `"fairness"` (case-insensitive, trimmed) -> priority.
- Priority mode: for `n` in 1..`number_of_workflows`, start `PriorityWorkflow` on
  `PriorityWorkflowTQ` with workflow id `f"{prefix}-{n}"`, start delay from the priority
  target, priority `assign_priority(n)`, and search attributes `Priority` +
  `ActivitiesCompleted=0`.
- Fairness mode: resolve bands (`config.bands` or `default_fairness_bands()`), resolve
  total workflows, build the submission order, compute the fairness target offset for the
  total, then start `FairnessWorkflow` on `fairness-queue` for each entry with workflow id
  `f"{prefix}-{n}"` (n is the 1-based index over the submission order), the fairness key,
  weight (0 if `disable_fairness`), and `ActivitiesCompleted=0`.
- Returns the literal plain-text string `"Done"` (not JSON). The current Java endpoint
  returns this exact body; keep it identical.

### GET `/run-status?runPrefix=<prefix>`

- Lists executions with the visibility query `WorkflowId STARTS_WITH "<prefix>"`.
- Parses each into a priority `ExecutionView`, aggregates with `aggregate_priority`,
  returns `PriorityTestRunResults` JSON.
- `runPrefix` is required.

### GET `/run-status-fairness?runPrefix=<prefix>`

- Same listing; parses fairness views; aggregates with `aggregate_fairness`; returns
  `FairnessTestRunResults` JSON.
- `runPrefix` is required.

## Testing strategy

Hermetic suite; no live dev server.

- `test_priority_rules.py`, `test_fairness_rules.py`, `test_delay_math.py`: pure-function
  tests for sections 1 through 5 of the domain core, including edge cases and seeded-RNG
  shuffle.
- `test_aggregation.py`: feed fabricated `ExecutionView` / `FairnessExecutionView` lists
  into `aggregate_priority` / `aggregate_fairness` and assert the exact frozen JSON
  structure, group ordering, empty-group behavior, and activity accumulation.
- `test_activities.py`: call the activity functions directly (or via the activity test
  environment) and assert the result line is appended and the input is returned.
- `test_workflows.py`: use `WorkflowEnvironment.start_time_skipping()` with the worker and
  a mocked or real activity. Assert each workflow runs 5 steps, upserts
  `ActivitiesCompleted` 1..5, and returns `"Complete"`. For fairness, assert the activity
  is invoked with a fairness priority when `disable_fairness` is False and without one
  when True.
- `test_api.py`: instantiate the FastAPI app with a mocked Temporal client (the client is
  injected via the lifespan / a dependency so tests can substitute a fake). Assert: POST
  returns `"Done"` and issues the right `start_workflow` calls (ids, task queues,
  priorities, search attributes); GET endpoints return JSON matching the frozen contract
  byte-shape (camelCase keys, 5 priority groups, fairness sort order). A module-level
  client must be reset between tests via an autouse fixture if one is used.

Follow strict TDD: write the failing test, minimal code to pass, refactor. The pure
functions and the API mapping are where most assertions live; the workflow tests verify
our orchestration, not the SDK.

## Run story

Local (four terminals, in order):

```
./startlocalserver.sh                      # repo root: dev server + fairness flag + SAs
cd python && ./scripts/startlocalworker.sh  # worker process
cd python && ./scripts/startapi.sh          # FastAPI on :7080
ui/startwebui.sh                            # repo root: UI on https://localhost:4000
```

Open https://localhost:4000 and run ~100 workflows. Temporal Server UI at
http://localhost:8233.

Cloud: set a `temporal env` profile (or `TEMPORAL_*` vars including TLS/API key), then run
the cloud worker script and the API with the matching profile. Connection is resolved by
`envconfig` so no code change is needed between local and cloud.

## Out of scope

- The React UI (`ui/`) is not modified.
- Prometheus / actuator-style metrics endpoints from the Java app are not ported unless
  requested later.
- The Java backend is left in place; this is an additive subdirectory.

## Assumptions to confirm on review

- Subdirectory name `python/` and package name `priority_fairness` (adjust to taste).
- Python 3.14 target.
- Exact typed search-attribute upsert call shape is verified against the installed
  `temporalio` version at implementation time.
- POST `/start-workflows` returns the plain string `"Done"`; if the UI does not depend on
  the body, this is trivially preserved but is kept identical to be safe.
- `numberOfWorkflows` upper bounds and input validation match Java (Java does minimal
  validation; the port keeps behavior unless stricter validation is wanted).
```

# Plan: Python port of the Temporal Priority/Fairness demo

This plan turns `spec.md` into an incremental, test-driven build. Work happens in the
`python/` subdirectory; the Java backend and the React UI in `ui/` are untouched. Each
step is a self-contained prompt for a code-generation LLM following strict
RED → GREEN → REFACTOR. Steps build strictly on prior steps and end by wiring the new
code into what already exists. No step leaves orphaned code.

Build order (dependency-first): scaffold → Pydantic models → pure domain functions →
aggregation → search attributes → activities → workflows → connection config → worker →
API (POST priority, POST fairness, GET status) → run scripts and docs.

All commands run from `python/`. `just check` = ruff + mypy; `just test` = pytest;
`just all` = fmt + check + test.

## Current status

| Step | Title | Status |
|------|-------|--------|
| 1  | Project scaffold and toolchain          | Not started |
| 2  | Pydantic models (payloads + frozen responses) | Not started |
| 3  | Domain: priority assignment + band helpers | Not started |
| 4  | Domain: fairness submission order        | Not started |
| 5  | Domain: start-delay math                 | Not started |
| 6  | Domain: priority aggregation             | Not started |
| 7  | Domain: fairness aggregation             | Not started |
| 8  | Search attributes: keys, builders, parsers | Not started |
| 9  | Activities                               | Not started |
| 10 | Workflows                                | Not started |
| 11 | Connection config (envconfig + converter) | Not started |
| 12 | Worker process                           | Not started |
| 13 | API: app, client injection, POST priority | Not started |
| 14 | API: POST fairness mode                  | Not started |
| 15 | API: GET status endpoints                | Not started |
| 16 | Run scripts, README, final verification  | Not started |

---

## Step 1: Project scaffold and toolchain

**NOTE**: Infrastructure step. No application logic yet, so no contrived RED tests
(per the testing guidelines: do not test config loading or framework behavior). The
goal is a working `uv` project where `just check` and `just test` run cleanly against
an empty suite. This is the one place we confirm the Python 3.14 wheel situation.

```text
1. Create the project skeleton under python/:
   - Create python/pyproject.toml:
     - [project] name = "priority-fairness", version = "0.1.0", requires-python = ">=3.14"
     - dependencies = ["temporalio[pydantic]", "pydantic", "fastapi", "uvicorn"]
     - [dependency-groups] dev = ["ruff", "mypy", "pytest", "pytest-asyncio", "httpx", "nox"]
     - [build-system] requires = ["hatchling"], build-backend = "hatchling.build"
     - [tool.hatch.build.targets.wheel] packages = ["src/priority_fairness"]
     - [tool.ruff] line-length = 120, target-version = "py314"
     - [tool.ruff.lint] select = ["E", "F", "I", "UP", "B", "SIM"]
     - [tool.mypy] strict = true, python_version = "3.14"
     - [tool.pytest.ini_options] asyncio_mode = "auto", testpaths = ["tests"]
   - Create python/src/priority_fairness/__init__.py (empty).
   - Create python/tests/ (no __init__.py needed for pytest).

2. Create python/constants.py at python/src/priority_fairness/constants.py:
   - 2-line ABOUTME header comment.
   - Task queue names: PRIORITY_WORKFLOW_TASK_QUEUE = "PriorityWorkflowTQ",
     PRIORITY_ACTIVITY_TASK_QUEUE = "PriorityActivityTQ",
     FAIRNESS_TASK_QUEUE = "fairness-queue".
   - Search attribute names: SA_PRIORITY = "Priority", SA_ACTIVITIES_COMPLETED =
     "ActivitiesCompleted", SA_FAIRNESS_KEY = "FairnessKey", SA_FAIRNESS_WEIGHT =
     "FairnessWeight".
   - Demo constants: ACTIVITY_STEPS = 5, ACTIVITY_SLEEP_SECONDS = 0.3,
     ACTIVITY_START_TO_CLOSE_SECONDS = 5, MAX_CONCURRENT_ACTIVITIES = 5,
     DEFAULT_NUMBER_OF_WORKFLOWS = 100, PRIORITY_LEVELS = 5, API_PORT = 7080,
     UI_ORIGIN = "https://localhost:4000".
   - Use strict type hints (Final[...] where appropriate).

3. Create python/justfile:
   - default: @just --list
   - check: ruff check . ; mypy .
   - fmt: ruff format . ; ruff check --fix .
   - test: pytest
   - all: fmt check test

4. Create python/noxfile.py with a tests session and a lint session (optional, mirror
   the toolchain reference).

5. Verify the toolchain:
   - Run `uv sync` from python/. CONFIRM temporalio[pydantic], fastapi, uvicorn,
     pydantic all resolve on Python 3.14. If a wheel is unavailable on 3.14, STOP and
     report; do not silently downgrade — note the lowest version that resolves and
     surface it for a decision (the spec flagged this as a confirm-on-pin item).
   - Run `just check` and `just test` (empty suite) and confirm both exit 0.

6. Add python/.gitignore entries for .venv/, __pycache__/, .pytest_cache/, .mypy_cache/,
   .ruff_cache/, .nox/.
```

---

## Step 2: Pydantic models (payloads + frozen responses)

**NOTE**: The custom logic here is the camelCase alias mapping, defaults, and
unknown-field handling that keep the wire contract frozen. That is OUR logic and is
worth testing. Do not test "Pydantic can validate a model" generally.

```text
1. RED: Write model tests first:
   - Create python/tests/test_models.py:
     - Test WorkflowConfig parses camelCase JSON {"workflowIdPrefix": "Run",
       "numberOfWorkflows": 50, "mode": "fairness", "disableFairness": true,
       "bands": [{"key": "a", "weight": 3, "count": 10}]} into snake_case attributes.
     - Test WorkflowConfig defaults: missing numberOfWorkflows -> 100,
       missing disableFairness -> False, missing mode -> None, missing bands -> None.
     - Test WorkflowConfig ignores unknown fields (e.g. {"extraField": 1} does not raise).
     - Test Band: count defaults to None when omitted; parses {"key","weight","count"}.
     - Test PriorityTestRunResults.model_dump(by_alias=True) yields keys
       "workflowsByPriority" and "totalWorkflowsInTest", with nested WorkflowSummary
       keys "workflowPriority", "numberOfWorkflows", "activities" and ActivitySummary
       keys "activityNumber", "numberCompleted".
     - Test FairnessTestRunResults.model_dump(by_alias=True) yields "workflowsByFairness"
       and "totalWorkflowsInTest", with FairnessSummary keys "fairnessKey",
       "fairnessWeight", "numberOfWorkflows", "activities".

2. Document the wire-contract intent:
   - Add a module docstring / ABOUTME header to models.py noting the JSON is camelCase
     to match the Java backend exactly, internal attributes are snake_case, and the
     React UI depends on these shapes.

3. GREEN: Write minimal code to pass:
   - Create python/src/priority_fairness/models.py:
     - Define Band, WorkflowConfig (request body + payload usage),
       PriorityWorkflowData, FairnessWorkflowData, PriorityActivityData,
       FairnessActivityData.
     - Define ActivitySummary, WorkflowSummary, PriorityTestRunResults,
       FairnessSummary, FairnessTestRunResults (response models).
     - Configure aliasing: use model_config = ConfigDict(populate_by_name=True,
       extra="ignore") and explicit Field(alias=...) for the camelCase response keys
       and the WorkflowConfig request keys (workflowIdPrefix, numberOfWorkflows,
       disableFairness). Response model field names should be the camelCase names
       directly (e.g. activityNumber) OR snake_case with aliases — pick one and keep it
       consistent so model_dump(by_alias=True) emits the exact Java keys.
     - results/activities/bands list fields default via default_factory=list where they
       are collections.
     - Strict type hints; no Any.

4. REFACTOR: Factor any shared model_config into a base model if it reduces duplication
   without obscuring the field definitions.

5. Verify meaningful coverage of the alias/default/extra logic and run `just check` and
   `just test`.
```

---

## Step 3: Domain — priority assignment and band helpers

**NOTE**: First pure-logic step in domain.py. Depends on models.Band and
models.WorkflowConfig from Step 2. These functions have no I/O and no clock.

```text
1. RED: Write pure-function tests first:
   - Create python/tests/test_priority_rules.py:
     - Test assign_priority(1) == 1, assign_priority(5) == 5, assign_priority(6) == 1,
       assign_priority(100) == 5, assign_priority(3) == 3.
   - Create python/tests/test_fairness_rules.py:
     - Test default_fairness_bands() returns exactly three bands in order:
       ("first-class", 15), ("business-class", 5), ("economy-class", 1), each with
       count is None.
     - Test resolve_total_workflows: with bands carrying counts [10, 5, 0] returns 15
       (sum of counts); with all counts None returns config.number_of_workflows; with a
       config of number_of_workflows=42 and no counts returns 42.
     - Test resolve_total_workflows treats count == 0 and count is None identically
       (has_counts is true only when some count > 0).

2. GREEN: Write minimal code to pass:
   - Create python/src/priority_fairness/domain.py with ABOUTME header.
   - Implement assign_priority(workflow_num: int) -> int returning ((n - 1) % 5) + 1.
   - Implement default_fairness_bands() -> list[Band] returning the three default bands.
   - Implement a private _has_counts(bands: list[Band]) -> bool helper
     (any band.count is not None and band.count > 0).
   - Implement resolve_total_workflows(config: WorkflowConfig, bands: list[Band]) -> int.

3. REFACTOR: Ensure constants (PRIORITY_LEVELS, band defaults) reference
   constants.py where it improves clarity; keep functions one-purpose.

4. Verify coverage of the branch logic (has_counts true/false) and run `just check`
   and `just test`.
```

---

## Step 4: Domain — fairness submission order

**NOTE**: Builds on Step 3 (_has_counts) in domain.py. The RNG is injected so the
shuffle is deterministic in tests; production passes a default `Random()`.

```text
1. RED: Write submission-order tests first:
   - Append to python/tests/test_fairness_rules.py:
     - Test count expansion: bands [("a",1,count=2), ("b",1,count=3)] with an injected
       Random(seed) produces a list of length 5 whose multiset is {a:2, b:3}
       (assert sorted keys / Counter equality, not order).
     - Test the shuffle is applied: with a fixed seed, build_submission_order returns a
       specific, asserted ordering (compute the expected order once with the same seed
       and pin it) to prove the RNG is actually used.
     - Test round-robin (no counts): bands [("a",1), ("b",1), ("c",1)] with
       number_of_workflows=7 produces keys [a,b,c,a,b,c,a] in that exact order and no
       shuffle is applied.

2. GREEN: Write minimal code to pass:
   - In python/src/priority_fairness/domain.py implement
     build_submission_order(bands: list[Band], number_of_workflows: int, rng: Random)
     -> list[Band]:
       - If _has_counts(bands): build a flat list repeating each band band.count times,
         then rng.shuffle(...) it in place; return it.
       - Else: round-robin bands[(n - 1) % len(bands)] for n in 1..number_of_workflows.
   - Import Random from random in the function signature typing.

3. REFACTOR: Keep the two branches readable; extract a small _expand_by_counts helper if
   it clarifies.

4. Verify coverage of both branches and run `just check` and `just test`.
```

---

## Step 5: Domain — start-delay math

**NOTE**: Pure time math in domain.py. Time is injected as `now`; no calls to the real
clock inside these functions.

```text
1. RED: Write delay-math tests first:
   - Create python/tests/test_delay_math.py:
     - Test priority_target_offset_seconds(100) == 10.0, (300) == 20.0, (0) == 5.0
       (n * 0.05 + 5).
     - Test fairness_target_offset_seconds(100) == 7 (floor), (200) == 15, (300) == 30,
       (440) == 30 (cap), and a low value like (10) clamps to 7.
     - Test start_delay: with now and target = now + 8s returns timedelta(seconds=8);
       with target in the past (now after target) returns timedelta(0).

2. GREEN: Write minimal code to pass:
   - In python/src/priority_fairness/domain.py implement:
     - priority_target_offset_seconds(n: int) -> float -> n * 0.05 + 5.
     - fairness_target_offset_seconds(n: int) -> int ->
       max(7, min(30, ceil(0.15 * n - 15))) using math.ceil.
     - start_delay(target: datetime, now: datetime) -> timedelta ->
       delta = target - now; return delta if delta > timedelta(0) else timedelta(0).
   - Import datetime, timedelta, ceil.

3. REFACTOR: Name the clamp bounds via constants if it reads better.

4. Verify edge coverage (floor, cap, negative clamp) and run `just check` and `just test`.
```

---

## Step 6: Domain — priority aggregation

**NOTE**: Implements the priority result aggregation plus the ExecutionView dataclass it
consumes. Depends on the response models from Step 2. Aggregation is pure: it takes
already-parsed views (parsing arrives in Step 8), so it is tested with fabricated data.

```text
1. RED: Write aggregation tests first:
   - Create python/tests/test_aggregation.py:
     - Test aggregate_priority([]) returns PriorityTestRunResults with
       totalWorkflowsInTest == 0 and exactly 5 WorkflowSummary groups for priorities
       1..5, each numberOfWorkflows == 0 and activities == [].
     - Test a single ExecutionView(priority=3, activities_completed=4) lands in the
       group with workflowPriority == 3 (index 2), sets its numberOfWorkflows to 1, and
       produces activities with activityNumber 1..4 each numberCompleted == 1, and no
       activityNumber 5.
     - Test accumulation: two views at priority 1 with activities_completed 5 and 2
       yield group-1 numberOfWorkflows == 2, activities[0..1].numberCompleted == 2,
       activities[2..4].numberCompleted == 1.
     - Test totalWorkflowsInTest equals the number of input views across priorities.

2. GREEN: Write minimal code to pass:
   - In python/src/priority_fairness/domain.py:
     - Define @dataclass ExecutionView with fields priority: int,
       activities_completed: int.
     - Implement aggregate_priority(executions: list[ExecutionView]) ->
       PriorityTestRunResults:
       - Build 5 WorkflowSummary groups (workflowPriority 1..5, numberOfWorkflows 0,
         activities []).
       - For each view: group = groups[priority - 1]; numberOfWorkflows += 1; for k in
         1..activities_completed, if an ActivitySummary at index k-1 is missing, append
         ActivitySummary(activityNumber=k, numberCompleted=1) else increment its
         numberCompleted.
       - Return PriorityTestRunResults(workflowsByPriority=groups,
         totalWorkflowsInTest=len(executions)).

3. REFACTOR: Extract a shared _accumulate_activities(activities, count) helper that both
   this step and Step 7 (fairness) will reuse, to avoid duplicating the activity
   accumulation loop.

4. Verify coverage of empty, single, and accumulation cases and run `just check` and
   `just test`.
```

---

## Step 7: Domain — fairness aggregation

**NOTE**: Mirrors Step 6 for fairness, reusing the _accumulate_activities helper.
Adds the FairnessExecutionView dataclass and the weight-desc / key-asc sort.

```text
1. RED: Write fairness-aggregation tests first:
   - Append to python/tests/test_aggregation.py:
     - Test three views with (key, weight) ("first-class",15), ("business-class",5),
       ("economy-class",1) produce three FairnessSummary groups sorted by weight
       descending: [15, 5, 1].
     - Test grouping: two views with the same (key, weight) collapse into one group with
       numberOfWorkflows == 2.
     - Test disable_fairness semantics: views with weight 0 across different keys are NOT
       merged (grouping is by (key, weight)); but views that share key "" and weight 0
       collapse into a single weight-0 group. Assert the weight-0 group sorts last.
     - Test tie-break: two groups with equal weight sort by fairnessKey ascending.
     - Test missing key parses to "" and missing weight to 0 at the view level is
       respected (construct views with key="" / weight=0 and assert grouping).
     - Test activity accumulation matches the priority case for a fairness group.

2. GREEN: Write minimal code to pass:
   - In python/src/priority_fairness/domain.py:
     - Define @dataclass FairnessExecutionView with fields fairness_key: str,
       fairness_weight: int, activities_completed: int.
     - Implement aggregate_fairness(executions: list[FairnessExecutionView]) ->
       FairnessTestRunResults:
       - Group by (fairness_key, fairness_weight) preserving first-seen insertion.
       - Accumulate numberOfWorkflows and activities via _accumulate_activities.
       - Sort groups by (-fairnessWeight, fairnessKey).
       - Return FairnessTestRunResults(workflowsByFairness=sorted_groups,
         totalWorkflowsInTest=len(executions)).

3. REFACTOR: Confirm _accumulate_activities is shared with Step 6 and not duplicated.

4. Verify coverage of sort order, grouping, tie-break, and run `just check` and
   `just test`.
```

---

## Step 8: Search attributes — keys, start builders, view parsers

**NOTE**: Bridges the SDK's typed search attributes to the pure domain views. The custom
logic is: which keys are set at start, and the defaulting in the parsers (missing key ->
"", missing weight/priority/completed -> 0). Test the parsers against fabricated typed
search attributes. Confirm the exact typed-SA API against the installed temporalio here.

```text
1. RED: Write parser tests first:
   - Create python/tests/test_search_attributes.py:
     - Build a temporalio.common.TypedSearchAttributes with Priority=2,
       ActivitiesCompleted=3 and assert parse_priority_view(...) returns
       ExecutionView(priority=2, activities_completed=3).
     - Build typed SAs missing ActivitiesCompleted and assert parse_priority_view
       defaults activities_completed to 0.
     - Build typed SAs with FairnessKey="business-class", FairnessWeight=5,
       ActivitiesCompleted=4 and assert parse_fairness_view returns
       FairnessExecutionView(fairness_key="business-class", fairness_weight=5,
       activities_completed=4).
     - Build typed SAs missing FairnessKey and FairnessWeight and assert
       parse_fairness_view defaults to fairness_key="" and fairness_weight=0.
   - The parsers accept whatever object the API listing yields; design them to take a
     typed-search-attributes container (parse_*_view(typed_attrs)) so tests can build the
     container directly without a full execution description.

2. Document the SA contract:
   - In python/src/priority_fairness/search_attributes.py add an ABOUTME header listing
     the four keys and their types, matching Java and the dev-server / cloud creation
     scripts.

3. GREEN: Write minimal code to pass:
   - Create python/src/priority_fairness/search_attributes.py:
     - Define typed keys: SearchAttributeKey.for_int("Priority"),
       .for_int("ActivitiesCompleted"), .for_keyword("FairnessKey"),
       .for_int("FairnessWeight"). CONFIRM the exact constructor names against the
       installed temporalio version; adjust if the API differs.
     - Implement build_priority_search_attributes(priority: int) ->
       TypedSearchAttributes with Priority and ActivitiesCompleted=0.
     - Implement build_fairness_search_attributes(fairness_key: str, fairness_weight:
       int) -> TypedSearchAttributes with FairnessKey, FairnessWeight, and
       ActivitiesCompleted=0 (caller passes weight already zeroed when disable_fairness).
     - Implement parse_priority_view(typed_attrs) -> ExecutionView and
       parse_fairness_view(typed_attrs) -> FairnessExecutionView with the documented
       defaulting. Import the view dataclasses from domain.py.

4. REFACTOR: Centralize key objects as module-level constants so builders and parsers
   share one definition each.

5. Verify coverage of the defaulting branches and run `just check` and `just test`.
```

---

## Step 9: Activities

**NOTE**: The activities are async and trivial; the only OUR-logic assertion is that the
result line is appended and the input object is returned. Do not assert on the timestamp
text or test asyncio.sleep itself.

```text
1. RED: Write activity tests first:
   - Create python/tests/test_activities.py:
     - Use temporalio.testing.ActivityEnvironment to run priority_activity with
       PriorityActivityData(step_number=2, priority=3, results=[]); assert the returned
       results has length 1 and the single entry contains the substring
       "Activity step [2] completed".
     - Run fairness_activity with FairnessActivityData(step_number=4,
       fairness_key="economy-class", fairness_weight=1, results=[]); assert the returned
       results has length 1 and contains "Activity step [4] completed".
     - (Keep ACTIVITY_SLEEP_SECONDS small enough that the suite stays fast; do not mock
       the sleep unless it slows the suite meaningfully.)

2. GREEN: Write minimal code to pass:
   - Create python/src/priority_fairness/activities.py:
     - @activity.defn async def priority_activity(data: PriorityActivityData) ->
       PriorityActivityData: await asyncio.sleep(ACTIVITY_SLEEP_SECONDS); append
       f"{datetime.now()} - Activity step [{data.step_number}] completed" to
       data.results; return data.
     - @activity.defn async def fairness_activity(data: FairnessActivityData) ->
       FairnessActivityData: same shape.
   - Import asyncio, datetime, the models, and ACTIVITY_SLEEP_SECONDS from constants.

3. REFACTOR: Factor the shared "append step line" into a small helper if it reads
   cleanly without coupling the two activity functions.

4. Verify coverage of the append/return behavior and run `just check` and `just test`.
```

---

## Step 10: Workflows

**NOTE**: First Temporal orchestration step. Tests use
WorkflowEnvironment.start_time_skipping() with a real Worker and a recording mock
activity. We assert OUR orchestration: 5 activity invocations, ActivitiesCompleted ends
at 5, return value "Complete", and that the fairness priority is set/omitted correctly.
This is where we lock the exact upsert and Priority API.

```text
1. RED: Write workflow tests first:
   - Create python/tests/test_workflows.py:
     - Define a recording mock activity (same name/signature) that captures
       activity.info().priority on each call and returns the input data.
     - Test PriorityWorkflow: start it via a time-skipping WorkflowEnvironment + Worker
       registering PriorityWorkflow and the mock priority activity; assert it returns
       "Complete", the activity was invoked 5 times, and after completion the workflow's
       ActivitiesCompleted search attribute equals 5 (describe the handle).
     - Test PriorityWorkflow sets activity priority: assert each recorded
       priority.priority_key equals the workflow's priority input.
     - Test FairnessWorkflow with disable_fairness=False: returns "Complete", activity
       invoked 5 times, recorded priority has fairness_key/fairness_weight matching input.
     - Test FairnessWorkflow with disable_fairness=True: returns "Complete" and the
       recorded priority carries no fairness key/weight (default priority).

2. GREEN: Write minimal code to pass:
   - Create python/src/priority_fairness/workflows.py:
     - Use `with workflow.unsafe.imports_passed_through(): from ... import models`
       so the Pydantic models pass the sandbox.
     - @workflow.defn class PriorityWorkflow with @workflow.run async def run(self,
       data: PriorityWorkflowData) -> str: loop counter 1..ACTIVITY_STEPS; execute
       priority_activity on PRIORITY_ACTIVITY_TASK_QUEUE with
       start_to_close_timeout=timedelta(seconds=ACTIVITY_START_TO_CLOSE_SECONDS) and
       priority=Priority(priority_key=data.priority); after each step
       workflow.upsert_search_attributes for ActivitiesCompleted=counter (CONFIRM the
       exact typed-update call against the installed temporalio); return "Complete".
     - @workflow.defn class FairnessWorkflow with @workflow.run async def run(self,
       data: FairnessWorkflowData) -> str: same loop on FAIRNESS_TASK_QUEUE; build
       Priority(fairness_key=..., fairness_weight=float(...)) only when not
       data.disable_fairness; upsert ActivitiesCompleted; return "Complete".
   - Pull task queue names, step count, and timeout from constants.

3. REFACTOR: Extract a shared private coroutine for the 1..5 step loop + upsert if it
   does not entangle the two workflows' differing activity options.

4. Verify the orchestration assertions hold and run `just check` and `just test`.
```

---

## Step 11: Connection config (envconfig + Pydantic converter)

**NOTE**: Thin infrastructure wrapper. Per the testing guidelines we do not unit-test
envconfig loading itself. The single OUR-logic assertion worth making is that our helper
always attaches the Pydantic data converter to whatever connect config envconfig returns.

```text
1. RED: Write one focused test:
   - Create python/tests/test_config.py:
     - Test that build_connect_config(...) returns a mapping whose "data_converter" is
       temporalio.contrib.pydantic.pydantic_data_converter. Monkeypatch /
       dependency-inject the envconfig loader so the test does not touch the filesystem
       or environment (e.g. pass an injectable loader that returns a minimal dict, or
       patch ClientConfig.load_client_connect_config to return {"target_host": "x"}).

2. GREEN: Write minimal code to pass:
   - Create python/src/priority_fairness/config.py:
     - build_connect_config(profile: str | None = None, *, loader=...) -> dict:
       call envconfig ClientConfig.load_client_connect_config (default loader), then set
       config["data_converter"] = pydantic_data_converter and return it.
     - connect_client(profile: str | None = None) -> Client async helper that calls
       Client.connect(**build_connect_config(profile)). Profile resolves from the
       TEMPORAL_PROFILE env var when not passed.
   - Import pydantic_data_converter, Client, envconfig ClientConfig.

3. REFACTOR: Keep the loader injectable so both worker and API share one connection path.

4. Verify the converter-attachment test and run `just check` and `just test`.
```

---

## Step 12: Worker process

**NOTE**: The testable wiring is the worker spec list: the three task queues and which
ones cap activities at 5. Express specs as data so they can be asserted without running
a worker or introspecting Worker internals; a thin builder turns specs into Workers.

```text
1. RED: Write worker-spec tests first:
   - Create python/tests/test_worker.py:
     - Test worker_specs() returns three specs whose task_queue values are exactly
       {"PriorityWorkflowTQ", "PriorityActivityTQ", "fairness-queue"}.
     - Test the PriorityWorkflowTQ spec registers PriorityWorkflow and no activities and
       has max_concurrent_activities is None (default).
     - Test the PriorityActivityTQ spec registers priority_activity and
       max_concurrent_activities == 5 and no workflows.
     - Test the fairness-queue spec registers FairnessWorkflow and fairness_activity and
       max_concurrent_activities == 5.

2. GREEN: Write minimal code to pass:
   - Create python/src/priority_fairness/worker.py:
     - Define @dataclass WorkerSpec with task_queue: str, workflows: list,
       activities: list, max_concurrent_activities: int | None.
     - Implement worker_specs() -> list[WorkerSpec] referencing constants for the queue
       names and MAX_CONCURRENT_ACTIVITIES, importing the workflow classes and activity
       functions.
     - Implement build_workers(client: Client) -> list[Worker] mapping specs to Worker
       objects (passing max_concurrent_activities only when not None).
     - Implement async def main() -> None: client = await connect_client(); run
       asyncio.gather over [w.run() for w in build_workers(client)].
     - Add `if __name__ == "__main__": asyncio.run(main())`.

3. REFACTOR: Ensure constants are the single source for queue names shared with
   workflows.py and the API.

4. Verify the spec assertions and run `just check` and `just test`.
```

---

## Step 13: API — app, client injection, POST priority mode

**NOTE**: FastAPI app with a dependency-injected Temporal client so tests substitute a
fake that records start_workflow calls. This step implements only the priority branch of
POST /start-workflows. Fairness branch is Step 14; GET endpoints are Step 15.

```text
1. RED: Write POST priority tests first:
   - Create python/tests/test_api.py:
     - Build a FakeClient recording every start_workflow call (capturing the workflow
       run method, args, id, task_queue, priority, search_attributes, start_delay) and
       override the app's client dependency with it.
     - Use httpx.AsyncClient against the app (ASGITransport).
     - Test POST /start-workflows with body {"workflowIdPrefix": "Run",
       "numberOfWorkflows": 3} (no mode) returns HTTP 200 and the plain-text body "Done".
     - Test it issued 3 start_workflow calls on task_queue "PriorityWorkflowTQ" with ids
       "Run-1", "Run-2", "Run-3".
     - Test the priority keys cycle 1,2,3 for n=1,2,3 (assert_priority via
       assign_priority) and that each call's search attributes include Priority and
       ActivitiesCompleted=0.
     - Test a start_delay is supplied on each call (a timedelta >= 0); assert later
       enqueues have delay <= earlier ones (monotonic non-increasing) without asserting
       exact wall-clock values.
     - Add an autouse fixture that resets any module-level client/state between tests.

2. GREEN: Write minimal code to pass:
   - Create python/src/priority_fairness/api.py:
     - Create the FastAPI app with a lifespan that connects the Temporal client via
       connect_client() and stores it; expose a get_client() dependency that tests can
       override (app.dependency_overrides).
     - Add CORS middleware allowing UI_ORIGIN for GET and POST.
     - Implement POST /start-workflows accepting WorkflowConfig. Normalize mode
       (None/empty/not "fairness" case-insensitive trimmed -> priority). Implement the
       priority branch: compute target = now + priority_target_offset_seconds(N); for n
       in 1..N call client.start_workflow(PriorityWorkflow.run,
       PriorityWorkflowData(priority=assign_priority(n)), id=f"{prefix}-{n}",
       task_queue=PRIORITY_WORKFLOW_TASK_QUEUE,
       priority=... (NOTE: priority is set on the activity inside the workflow, not at
       start; do NOT pass workflow priority), search_attributes=
       build_priority_search_attributes(assign_priority(n)),
       start_delay=start_delay(target, now())). Return PlainTextResponse("Done").
   - Use datetime.now() at the call site (the domain math stays pure; the API supplies
     the clock).

3. RED: Add an integration check:
   - Test that an empty/missing body still defaults sensibly (numberOfWorkflows default
     100 would start 100 workflows; to keep the test fast, assert the default is applied
     by sending {"workflowIdPrefix": "X"} and asserting len(calls) == 100, or assert the
     parsed config default rather than starting 100 — prefer asserting via a small N).

4. GREEN: Wire the priority branch fully so the test passes.

5. REFACTOR: Extract a _start_priority_workflows(client, config) coroutine to keep the
   route handler thin.

6. Verify coverage of id/queue/priority/SA/delay mapping and run `just check` and
   `just test`.
```

---

## Step 14: API — POST fairness mode

**NOTE**: Extends POST /start-workflows with the fairness branch. Reuses
default_fairness_bands, resolve_total_workflows, build_submission_order,
fairness_target_offset_seconds, and build_fairness_search_attributes. RNG is injected so
submission order is deterministic in tests.

```text
1. RED: Write POST fairness tests first:
   - Append to python/tests/test_api.py (reuse the FakeClient + override):
     - Test POST with {"workflowIdPrefix":"F","mode":"fairness","numberOfWorkflows":6}
       and no bands starts 6 FairnessWorkflow calls on task_queue "fairness-queue" with
       ids "F-1".."F-6" and round-robins the default bands first/business/economy.
     - Test each fairness call's search attributes include FairnessKey, FairnessWeight,
       and ActivitiesCompleted=0; FairnessWeight matches the band weight.
     - Test explicit counts: bands [{"key":"a","weight":2,"count":2},
       {"key":"b","weight":1,"count":3}] start 5 workflows (count sum), with the band
       multiset {a:2, b:3}, regardless of numberOfWorkflows.
     - Test disable_fairness=true: FairnessWeight is set to 0 in the search attributes
       for every started workflow.
     - Make the submission order deterministic by injecting a seeded RNG into the route
       path (e.g. an overridable get_rng dependency) so the counts test is stable.

2. GREEN: Write minimal code to pass:
   - In python/src/priority_fairness/api.py implement the fairness branch of
     POST /start-workflows:
       - bands = config.bands or default_fairness_bands().
       - total = resolve_total_workflows(config, bands).
       - order = build_submission_order(bands, total, rng) via the injected get_rng.
       - target = now + fairness_target_offset_seconds(total).
       - For index, band in enumerate(order, start=1): weight = 0 if
         config.disable_fairness else band.weight; call client.start_workflow(
         FairnessWorkflow.run, FairnessWorkflowData(fairness_key=band.key,
         fairness_weight=band.weight, disable_fairness=config.disable_fairness),
         id=f"{prefix}-{index}", task_queue=FAIRNESS_TASK_QUEUE,
         search_attributes=build_fairness_search_attributes(band.key, weight),
         start_delay=start_delay(target, now())).
       - Return PlainTextResponse("Done").
   - Add a get_rng dependency returning a default Random(), overridable in tests.

3. REFACTOR: Extract _start_fairness_workflows(client, config, rng) mirroring
   _start_priority_workflows; route handler just dispatches by mode.

4. Verify coverage of default bands, explicit counts, weights, and disable_fairness and
   run `just check` and `just test`.
```

---

## Step 15: API — GET status endpoints

**NOTE**: Adds the two read endpoints. The FakeClient now also serves list_workflows
returning fabricated executions whose typed search attributes drive the parsers and
aggregation from Steps 6–8. Assertions are on the frozen JSON shape.

```text
1. RED: Write GET tests first:
   - Append to python/tests/test_api.py:
     - Extend FakeClient.list_workflows to yield fabricated execution descriptions (each
       exposing typed search attributes) based on a per-test fixture list, and to record
       the query string it was called with.
     - Test GET /run-status?runPrefix=Run calls list_workflows with the query
       'WorkflowId STARTS_WITH "Run"' and returns JSON with keys "workflowsByPriority"
       (length 5) and "totalWorkflowsInTest"; given fabricated executions at priorities
       1 and 3, assert those groups' numberOfWorkflows and the activity counts.
     - Test GET /run-status-fairness?runPrefix=F returns JSON with "workflowsByFairness"
       sorted by weight desc and "totalWorkflowsInTest"; given fabricated executions for
       the three default bands, assert the order [15,5,1] and counts.
     - Test that missing runPrefix yields HTTP 422 (FastAPI required-query validation).

2. GREEN: Write minimal code to pass:
   - In python/src/priority_fairness/api.py:
     - GET /run-status(runPrefix: str): executions = [e async for e in
       client.list_workflows(f'WorkflowId STARTS_WITH "{runPrefix}"')]; views =
       [parse_priority_view(e.typed_search_attributes) for e in executions]; return
       aggregate_priority(views) (FastAPI serializes via the response model; ensure
       by_alias output — set response_model or return model.model_dump(by_alias=True)
       through a JSONResponse to guarantee camelCase keys).
     - GET /run-status-fairness(runPrefix: str): same with parse_fairness_view and
       aggregate_fairness.
   - CONFIRM the attribute name for an execution's typed search attributes against the
     installed temporalio (e.g. .typed_search_attributes) and adjust the parser call site
     accordingly.

3. REFACTOR: Extract a _list_executions(client, run_prefix) helper shared by both routes.

4. Verify the camelCase keys, 5-group priority shape, fairness sort order, and required
   runPrefix and run `just check` and `just test`.
```

---

## Step 16: Run scripts, README, and final verification

**NOTE**: Final integration and polish. Shell scripts and docs (no unit tests). The
existing root-level search-attribute and dev-server scripts are reused unchanged.

```text
1. Create the run scripts under python/scripts/ (chmod +x):
   - startlocalworker.sh: `uv run python -m priority_fairness.worker` (run from python/).
   - startapi.sh: `uv run uvicorn priority_fairness.api:app --port 7080`.
   - startcloudworker.sh: accept an optional profile arg, export TEMPORAL_PROFILE (or
     pass it through), then `uv run python -m priority_fairness.worker`. Mirror the
     existing startcloudworker.sh ergonomics where reasonable (validate the profile/env
     vars are present).

2. Create python/README.md:
   - Document the four-terminal local run story from the spec (startlocalserver.sh at
     repo root, then python/scripts/startlocalworker.sh, python/scripts/startapi.sh,
     ui/startwebui.sh).
   - Document the cloud path via a temporal env profile / TEMPORAL_* vars.
   - Note the frozen API contract and that the React UI is unchanged.
   - Note the Python 3.14 target and the temporalio wheel confirmation from Step 1.

3. Final wiring check (no live server required for the suite):
   - Run `just all` (fmt + check + test) from python/ and confirm zero ruff/mypy errors
     and all tests pass.
   - Confirm every module has its ABOUTME header, empty __init__.py is present, and
     imports are absolute.

4. Manual smoke (optional, requires the dev server): start the dev server and the two
   Python processes, open the UI, run ~100 workflows in each mode, and confirm the UI
   renders progress identically to the Java backend. Document any deviation.
```

---

## Implementation guidelines

- **TDD discipline**: every step writes failing tests first, minimal code to pass, then
  refactor. Run `just check` and `just test` at the end of each step before moving on.
- **Test only our logic**: alias/default handling, the domain pure functions, aggregation,
  SA parsing/defaulting, activity append behavior, workflow orchestration, worker specs,
  and the API request/response mapping. Do not test Pydantic, FastAPI, or the Temporal
  SDK themselves.
- **Purity**: domain.py never imports Temporal, never reads the clock, never does I/O.
  The API supplies `now()` and the RNG; the parsers convert SDK types into plain views so
  aggregation stays testable with fabricated data.
- **Frozen contract**: response JSON must emit the exact camelCase keys the React UI
  reads. Assert `by_alias` output in tests. POST /start-workflows returns the plain string
  "Done".
- **Single source of names**: task queue names, SA names, and demo constants live in
  constants.py and are imported everywhere (workflows, worker, search_attributes, api).
- **SDK API confirmation**: the exact typed search-attribute key constructors, the
  upsert-call shape, the Priority constructor, and the execution's typed-search-attributes
  accessor are confirmed against the installed temporalio version in Steps 8, 10, and 15.
  If an API differs from the spec's sketch, adjust the implementation and note it.
- **No orphaned code**: each step ends by integrating its output into an entry point or a
  caller introduced in a prior step. The worker (Step 12) and API (Steps 13–15) consume
  everything below them.

## Success metrics

- `just all` passes from python/ with zero ruff and mypy (strict) errors.
- The hermetic suite passes with no live Temporal server: pure-function tests, aggregation
  tests, SA parser tests, activity tests, workflow time-skipping tests, worker-spec tests,
  and API tests with a mocked client.
- POST /start-workflows starts the correct number of workflows on the correct task queues
  with the correct ids, priorities/fairness keys, search attributes, and start delays for
  both modes (verified via the mocked client).
- GET /run-status and /run-status-fairness return JSON matching the Java backend
  field-for-field (camelCase keys, 5 priority groups always present, fairness groups
  sorted by weight desc then key asc).
- The React UI in `ui/` works unchanged against the Python backend (manual smoke).
- The Java backend and all root-level scripts remain untouched; the Python project is
  additive under python/.

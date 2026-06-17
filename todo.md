# TODO: Python port of the Temporal Priority/Fairness demo

Mirrors `plan.md`. Execute-plan checks off each sub-step as work progresses. All commands
run from `python/`.

## Step 1: Project scaffold and toolchain
- [x] 1. Create python/pyproject.toml (project, deps, dev group, hatchling build, ruff, mypy, pytest config)
- [x] 2. Create constants.py (task queues, SA names, demo constants)
- [x] 3. Create python/justfile (default/check/fmt/test/all)
- [x] 4. Create python/noxfile.py (tests + lint sessions)
- [x] 5. `uv sync` and CONFIRM temporalio[pydantic]/fastapi/uvicorn/pydantic resolve on Python 3.14 (stop + report if not)
- [x] 6. Add python/.gitignore; confirm `just check` and `just test` (empty) exit 0

## Step 2: Pydantic models (payloads + frozen responses)
- [x] 1. RED: tests/test_models.py (camelCase parse, defaults, extra ignore, by_alias serialization of response models)
- [x] 2. Document wire-contract intent in models.py header
- [x] 3. GREEN: models.py (Band, WorkflowConfig, *WorkflowData, *ActivityData, response models with aliases)
- [x] 4. REFACTOR: shared model_config base if it helps
- [x] 5. Verify alias/default/extra coverage; `just check` + `just test`

## Step 3: Domain — priority assignment and band helpers
- [x] 1. RED: tests/test_priority_rules.py (assign_priority) + tests/test_fairness_rules.py (default bands, resolve_total_workflows, count==0 vs None)
- [x] 2. GREEN: domain.py assign_priority, default_fairness_bands, _has_counts, resolve_total_workflows
- [x] 3. REFACTOR: reference constants; one-purpose functions
- [x] 4. Verify has_counts branch coverage; `just check` + `just test`

## Step 4: Domain — fairness submission order
- [x] 1. RED: extend test_fairness_rules.py (count expansion multiset, seeded shuffle order pinned, round-robin exact order)
- [x] 2. GREEN: build_submission_order with injected Random (counts -> expand + shuffle; else round-robin)
- [x] 3. REFACTOR: _expand_by_counts helper if clearer
- [x] 4. Verify both branches; `just check` + `just test`

## Step 5: Domain — start-delay math
- [x] 1. RED: tests/test_delay_math.py (priority offset, fairness offset floor/cap, start_delay negative clamp)
- [x] 2. GREEN: priority_target_offset_seconds, fairness_target_offset_seconds, start_delay
- [x] 3. REFACTOR: clamp bounds via constants if cleaner
- [x] 4. Verify edge coverage; `just check` + `just test`

## Step 6: Domain — priority aggregation
- [ ] 1. RED: tests/test_aggregation.py (empty -> 5 groups/total 0; single priority-3/4-acts; accumulation; total count)
- [ ] 2. GREEN: ExecutionView dataclass + aggregate_priority
- [ ] 3. REFACTOR: extract shared _accumulate_activities helper
- [ ] 4. Verify empty/single/accumulation; `just check` + `just test`

## Step 7: Domain — fairness aggregation
- [ ] 1. RED: extend test_aggregation.py (weight-desc sort, grouping collapse, weight-0 last, key tie-break, missing key/weight, activity accumulation)
- [ ] 2. GREEN: FairnessExecutionView dataclass + aggregate_fairness (group by (key,weight), sort -weight then key)
- [ ] 3. REFACTOR: confirm _accumulate_activities reused, not duplicated
- [ ] 4. Verify sort/grouping/tie-break; `just check` + `just test`

## Step 8: Search attributes — keys, start builders, view parsers
- [ ] 1. RED: tests/test_search_attributes.py (parse_priority_view + defaulting; parse_fairness_view + defaulting "" / 0)
- [ ] 2. Document the four SA keys/types in search_attributes.py header
- [ ] 3. GREEN: typed SA keys (CONFIRM constructors), build_priority/fairness_search_attributes, parse_priority/fairness_view
- [ ] 4. REFACTOR: module-level key constants shared by builders and parsers
- [ ] 5. Verify defaulting branches; `just check` + `just test`

## Step 9: Activities
- [ ] 1. RED: tests/test_activities.py (ActivityEnvironment; result line appended w/ "Activity step [N] completed"; input returned)
- [ ] 2. GREEN: activities.py priority_activity + fairness_activity (async sleep, append line, return)
- [ ] 3. REFACTOR: shared append-line helper if clean
- [ ] 4. Verify append/return; `just check` + `just test`

## Step 10: Workflows
- [ ] 1. RED: tests/test_workflows.py (time-skipping env + recording mock activity; 5 calls, ActivitiesCompleted=5, "Complete", priority/fairness priority set/omitted)
- [ ] 2. GREEN: workflows.py PriorityWorkflow + FairnessWorkflow (imports_passed_through, activity priority, upsert SA — CONFIRM API)
- [ ] 3. REFACTOR: shared step-loop coroutine if it doesn't entangle activity options
- [ ] 4. Verify orchestration assertions; `just check` + `just test`

## Step 11: Connection config (envconfig + Pydantic converter)
- [ ] 1. RED: tests/test_config.py (build_connect_config attaches pydantic_data_converter; injected/patched loader)
- [ ] 2. GREEN: config.py build_connect_config + connect_client (envconfig + converter; profile from TEMPORAL_PROFILE)
- [ ] 3. REFACTOR: injectable loader shared by worker + API
- [ ] 4. Verify converter attachment; `just check` + `just test`

## Step 12: Worker process
- [ ] 1. RED: tests/test_worker.py (worker_specs: 3 queues; per-queue workflows/activities; max_concurrent_activities None/5/5)
- [ ] 2. GREEN: worker.py WorkerSpec, worker_specs(), build_workers(client), async main() + asyncio.gather + __main__
- [ ] 3. REFACTOR: constants as single source for queue names
- [ ] 4. Verify spec assertions; `just check` + `just test`

## Step 13: API — app, client injection, POST priority mode
- [ ] 1. RED: tests/test_api.py (FakeClient recording start_workflow; POST priority -> "Done", 3 calls, ids, cycling priorities, SAs, monotonic delays; autouse state reset)
- [ ] 2. GREEN: api.py app + lifespan client + get_client dependency + CORS + POST priority branch (PlainTextResponse "Done")
- [ ] 3. RED: default-config integration check (small-N default applied)
- [ ] 4. GREEN: wire priority branch fully
- [ ] 5. REFACTOR: extract _start_priority_workflows
- [ ] 6. Verify id/queue/priority/SA/delay mapping; `just check` + `just test`

## Step 14: API — POST fairness mode
- [ ] 1. RED: extend test_api.py (default-band round-robin 6; SAs incl. weight; explicit counts multiset; disable_fairness weight 0; injected seeded RNG)
- [ ] 2. GREEN: fairness branch (bands or defaults, resolve total, build order, target, weight zeroing, build_fairness_search_attributes) + get_rng dependency
- [ ] 3. REFACTOR: extract _start_fairness_workflows; route dispatches by mode
- [ ] 4. Verify bands/counts/weights/disable_fairness; `just check` + `just test`

## Step 15: API — GET status endpoints
- [ ] 1. RED: extend test_api.py (list_workflows query string; /run-status 5 groups + counts; /run-status-fairness sorted [15,5,1]; missing runPrefix -> 422)
- [ ] 2. GREEN: GET /run-status + /run-status-fairness (list, parse views, aggregate, camelCase by_alias output; CONFIRM typed-SA accessor)
- [ ] 3. REFACTOR: extract _list_executions helper
- [ ] 4. Verify camelCase/shape/sort/required-param; `just check` + `just test`

## Step 16: Run scripts, README, and final verification
- [ ] 1. Create python/scripts/startlocalworker.sh, startapi.sh, startcloudworker.sh (chmod +x)
- [ ] 2. Create python/README.md (four-terminal local run, cloud path, frozen contract, 3.14 note)
- [ ] 3. `just all` passes; ABOUTME headers, empty __init__.py, absolute imports confirmed
- [ ] 4. Optional manual smoke against dev server (UI renders identically in both modes)

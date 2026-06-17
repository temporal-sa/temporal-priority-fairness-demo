# Lessons Learned

## Recent
<!-- 10 most recent lessons, newest first -->
- temporalio 1.28.0: `ClientConfig.load_client_connect_config(profile)` returns a `ClientConnectConfig` that is a plain `dict` subclass (TypedDict, total=False), so you can mutate `config["data_converter"] = pydantic_data_converter` and spread it straight into `Client.connect(**config)`. For hermetic envconfig tests, inject the loader as `Callable[[str | None], dict]` rather than monkeypatching the classmethod (2026-06-17)
- Workflows that upsert a CUSTOM search attribute must be tested with `WorkflowEnvironment.start_local(search_attributes=[...])`, which registers the keys at server startup. `start_time_skipping()` (Java test server) cannot register custom SAs, so the upsert is rejected ("search attribute X is not defined") and the workflow task fails/retries forever, hanging the test (2026-06-17)
- To diagnose a hanging Temporal workflow test, wrap `handle.result()` in `asyncio.wait_for(..., timeout=N)` in a throwaway script; the test server logs the real rejection reason instead of silently hanging at 0% CPU (2026-06-17)
- temporalio 1.28.0: `Priority(priority_key, fairness_key, fairness_weight)` takes `fairness_weight` as a float; `workflow.upsert_search_attributes` takes a sequence of `key.value_set(value)` updates (dict form deprecated); `workflow.execute_activity` accepts a `priority=` kwarg (2026-06-17)
- For tests of RNG-driven code with an injected `Random(seed)`, compute the expected shuffled sequence once in a throwaway interpreter run and hardcode it; re-running the same seeded shuffle inside the test body asserts nothing (2026-06-17)
- Under mypy strict, constructing a Pydantic model by snake_case field names when the fields have camelCase aliases fails unless the pydantic mypy plugin is enabled (`[tool.mypy] plugins = ["pydantic.mypy"]`); pair it with `populate_by_name=True` on the model and `init_typed=true` in `[tool.pydantic-mypy]` (2026-06-17)
- justfile recipes for a uv-managed project must call `uv run <tool>` (e.g. `uv run ruff check .`); bare `ruff`/`mypy`/`pytest` only resolve if the venv is already activated, which a fresh shell is not (2026-06-17)
- pytest exits 5 ("no tests collected") on an empty suite, which fails `just test`; have the test recipe swallow exit 5 only so a scaffold's empty suite passes without hiding real failures (2026-06-17)
- All four demo deps (temporalio[pydantic], fastapi, uvicorn, pydantic) resolve on Python 3.14.5 with no downgrades as of 2026-06-17 (2026-06-17)

## Tooling
- justfile recipes for a uv-managed project must call `uv run <tool>` (e.g. `uv run ruff check .`); bare `ruff`/`mypy`/`pytest` only resolve if the venv is already activated, which a fresh shell is not (2026-06-17)
- pytest exits 5 ("no tests collected") on an empty suite, which fails `just test`; have the test recipe swallow exit 5 only so a scaffold's empty suite passes without hiding real failures (2026-06-17)

## Testing
- For tests of RNG-driven code with an injected `Random(seed)`, compute the expected shuffled sequence once in a throwaway interpreter run and hardcode it; re-running the same seeded shuffle inside the test body asserts nothing (2026-06-17)
- To diagnose a hanging Temporal workflow test, wrap `handle.result()` in `asyncio.wait_for(..., timeout=N)` in a throwaway script; the test server logs the real rejection reason instead of silently hanging at 0% CPU (2026-06-17)

## Temporal
- temporalio 1.28.0: `ClientConfig.load_client_connect_config(profile)` returns a `ClientConnectConfig` that is a plain `dict` subclass (TypedDict, total=False), so you can mutate `config["data_converter"] = pydantic_data_converter` and spread it straight into `Client.connect(**config)`. For hermetic envconfig tests, inject the loader as `Callable[[str | None], dict]` rather than monkeypatching the classmethod (2026-06-17)
- Workflows that upsert a CUSTOM search attribute must be tested with `WorkflowEnvironment.start_local(search_attributes=[...])`, which registers the keys at server startup. `start_time_skipping()` (Java test server) cannot register custom SAs, so the upsert is rejected ("search attribute X is not defined") and the workflow task fails/retries forever, hanging the test (2026-06-17)
- temporalio 1.28.0: `Priority(priority_key, fairness_key, fairness_weight)` takes `fairness_weight` as a float; `workflow.upsert_search_attributes` takes a sequence of `key.value_set(value)` updates (dict form deprecated); `workflow.execute_activity` accepts a `priority=` kwarg (2026-06-17)
- First `start_local()` downloads a ~575MB temporal CLI dev-server into `$TMPDIR/temporal-sdk-python-<ver>.downloading` then caches it; budget several minutes for the first run, ~1.6s thereafter (2026-06-17)

## Python
- Under mypy strict, constructing a Pydantic model by snake_case field names when the fields have camelCase aliases fails unless the pydantic mypy plugin is enabled (`[tool.mypy] plugins = ["pydantic.mypy"]`); pair it with `populate_by_name=True` and `init_typed=true` in `[tool.pydantic-mypy]` (2026-06-17)
- All four demo deps (temporalio[pydantic], fastapi, uvicorn, pydantic) resolve on Python 3.14.5 with no downgrades as of 2026-06-17 (2026-06-17)

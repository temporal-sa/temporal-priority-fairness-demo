# Lessons Learned

## Recent
<!-- 10 most recent lessons, newest first -->
- Under mypy strict, constructing a Pydantic model by snake_case field names when the fields have camelCase aliases fails unless the pydantic mypy plugin is enabled (`[tool.mypy] plugins = ["pydantic.mypy"]`); pair it with `populate_by_name=True` on the model and `init_typed=true` in `[tool.pydantic-mypy]` (2026-06-17)
- justfile recipes for a uv-managed project must call `uv run <tool>` (e.g. `uv run ruff check .`); bare `ruff`/`mypy`/`pytest` only resolve if the venv is already activated, which a fresh shell is not (2026-06-17)
- pytest exits 5 ("no tests collected") on an empty suite, which fails `just test`; have the test recipe swallow exit 5 only so a scaffold's empty suite passes without hiding real failures (2026-06-17)
- All four demo deps (temporalio[pydantic], fastapi, uvicorn, pydantic) resolve on Python 3.14.5 with no downgrades as of 2026-06-17 (2026-06-17)

## Tooling
- justfile recipes for a uv-managed project must call `uv run <tool>` (e.g. `uv run ruff check .`); bare `ruff`/`mypy`/`pytest` only resolve if the venv is already activated, which a fresh shell is not (2026-06-17)
- pytest exits 5 ("no tests collected") on an empty suite, which fails `just test`; have the test recipe swallow exit 5 only so a scaffold's empty suite passes without hiding real failures (2026-06-17)

## Python
- Under mypy strict, constructing a Pydantic model by snake_case field names when the fields have camelCase aliases fails unless the pydantic mypy plugin is enabled (`[tool.mypy] plugins = ["pydantic.mypy"]`); pair it with `populate_by_name=True` and `init_typed=true` in `[tool.pydantic-mypy]` (2026-06-17)
- All four demo deps (temporalio[pydantic], fastapi, uvicorn, pydantic) resolve on Python 3.14.5 with no downgrades as of 2026-06-17 (2026-06-17)

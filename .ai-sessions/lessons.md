# Lessons Learned

## Recent
<!-- 10 most recent lessons, newest first -->
- pytest exits 5 ("no tests collected") on an empty suite, which fails `just test`; have the test recipe swallow exit 5 only so a scaffold's empty suite passes without hiding real failures (2026-06-17)
- All four demo deps (temporalio[pydantic], fastapi, uvicorn, pydantic) resolve on Python 3.14.5 with no downgrades as of 2026-06-17 (2026-06-17)

## Tooling
- pytest exits 5 ("no tests collected") on an empty suite, which fails `just test`; have the test recipe swallow exit 5 only so a scaffold's empty suite passes without hiding real failures (2026-06-17)

## Python
- All four demo deps (temporalio[pydantic], fastapi, uvicorn, pydantic) resolve on Python 3.14.5 with no downgrades as of 2026-06-17 (2026-06-17)

# ABOUTME: Nox sessions mirroring the just tasks: a tests session and a lint session
# ABOUTME: so CI and local runs share one definition of the toolchain.

import nox


@nox.session(python=["3.14"])
def tests(session: nox.Session) -> None:
    session.install(".")
    session.install("pytest", "pytest-asyncio", "httpx")
    session.run("pytest")


@nox.session
def lint(session: nox.Session) -> None:
    session.install("ruff", "mypy")
    session.run("ruff", "check", ".")
    session.run("mypy", ".")

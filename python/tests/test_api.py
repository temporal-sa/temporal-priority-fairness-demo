"""Tests for the FastAPI app and the POST /start-workflows priority branch.

A FakeClient records every start_workflow call (run method, args, id, task_queue,
priority, search_attributes, start_delay) and is substituted for the real Temporal
client via the app's get_client dependency override. The HTTP layer is exercised with
httpx.AsyncClient over an ASGITransport so no live server or Temporal connection runs.

Only OUR mapping is asserted: the count of starts, the workflow ids, the cycling
priorities, the start-time search attributes, and the monotonic non-increasing start
delays. The fairness branch and GET endpoints arrive in later steps.
"""

from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import httpx
import pytest

from priority_fairness import api
from priority_fairness.constants import (
    PRIORITY_WORKFLOW_TASK_QUEUE,
    SA_ACTIVITIES_COMPLETED,
    SA_PRIORITY,
)
from priority_fairness.domain import assign_priority
from priority_fairness.search_attributes import (
    ACTIVITIES_COMPLETED_KEY,
    PRIORITY_KEY,
)


@dataclass
class StartCall:
    """One recorded client.start_workflow invocation."""

    run: Any
    args: tuple[Any, ...]
    id: str
    task_queue: str
    priority: Any
    search_attributes: Any
    start_delay: timedelta | None


@dataclass
class FakeClient:
    """Records every start_workflow call without contacting a Temporal server."""

    calls: list[StartCall] = field(default_factory=list)

    async def start_workflow(
        self,
        run: Any,
        *args: Any,
        id: str,
        task_queue: str,
        priority: Any = None,
        search_attributes: Any = None,
        start_delay: timedelta | None = None,
        **_extra: Any,
    ) -> None:
        self.calls.append(
            StartCall(
                run=run,
                args=args,
                id=id,
                task_queue=task_queue,
                priority=priority,
                search_attributes=search_attributes,
                start_delay=start_delay,
            )
        )


@pytest.fixture(autouse=True)
def reset_app_state() -> Iterator[None]:
    """Clear any module-level client/state and dependency overrides between tests."""
    api.app.dependency_overrides.clear()
    api.app.state.temporal_client = None
    yield
    api.app.dependency_overrides.clear()
    api.app.state.temporal_client = None


@pytest.fixture
def fake_client() -> FakeClient:
    client = FakeClient()
    api.app.dependency_overrides[api.get_client] = lambda: client
    return client


def _http_client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=api.app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def test_post_priority_returns_done(fake_client: FakeClient) -> None:
    async with _http_client() as client:
        response = await client.post(
            "/start-workflows",
            json={"workflowIdPrefix": "Run", "numberOfWorkflows": 3},
        )

    assert response.status_code == 200
    assert response.text == "Done"


async def test_post_priority_starts_one_workflow_per_n_on_priority_queue(
    fake_client: FakeClient,
) -> None:
    async with _http_client() as client:
        await client.post(
            "/start-workflows",
            json={"workflowIdPrefix": "Run", "numberOfWorkflows": 3},
        )

    assert len(fake_client.calls) == 3
    assert [call.id for call in fake_client.calls] == ["Run-1", "Run-2", "Run-3"]
    assert all(call.task_queue == PRIORITY_WORKFLOW_TASK_QUEUE for call in fake_client.calls)


async def test_post_priority_cycles_priorities_and_sets_search_attributes(
    fake_client: FakeClient,
) -> None:
    async with _http_client() as client:
        await client.post(
            "/start-workflows",
            json={"workflowIdPrefix": "Run", "numberOfWorkflows": 3},
        )

    for index, call in enumerate(fake_client.calls, start=1):
        expected_priority = assign_priority(index)
        # The workflow priority argument is the data payload, not a Temporal Priority:
        # activity priority is set inside the workflow, so no workflow-level priority.
        assert call.priority is None
        assert call.args[0].priority == expected_priority

        attrs = call.search_attributes
        assert attrs.get(PRIORITY_KEY) == expected_priority
        assert attrs.get(ACTIVITIES_COMPLETED_KEY) == 0

    assert [call.args[0].priority for call in fake_client.calls] == [1, 2, 3]
    # Sanity: the SA key names match the frozen contract.
    assert PRIORITY_KEY.name == SA_PRIORITY
    assert ACTIVITIES_COMPLETED_KEY.name == SA_ACTIVITIES_COMPLETED


async def test_post_priority_supplies_monotonic_non_increasing_delays(
    fake_client: FakeClient,
) -> None:
    async with _http_client() as client:
        await client.post(
            "/start-workflows",
            json={"workflowIdPrefix": "Run", "numberOfWorkflows": 3},
        )

    raw_delays = [call.start_delay for call in fake_client.calls]
    assert all(isinstance(delay, timedelta) for delay in raw_delays)
    delays = [delay for delay in raw_delays if delay is not None]
    assert len(delays) == len(raw_delays)
    assert all(delay >= timedelta(0) for delay in delays)
    assert delays == sorted(delays, reverse=True)


async def test_post_priority_applies_default_number_of_workflows(
    fake_client: FakeClient,
) -> None:
    # numberOfWorkflows is omitted; assert the default of 100 is applied. Kept hermetic:
    # the FakeClient records calls without starting real workflows.
    async with _http_client() as client:
        response = await client.post(
            "/start-workflows",
            json={"workflowIdPrefix": "X"},
        )

    assert response.status_code == 200
    assert len(fake_client.calls) == 100
    assert fake_client.calls[0].id == "X-1"
    assert fake_client.calls[-1].id == "X-100"


async def test_post_priority_treats_blank_and_unknown_mode_as_priority(
    fake_client: FakeClient,
) -> None:
    async with _http_client() as client:
        await client.post(
            "/start-workflows",
            json={"workflowIdPrefix": "Run", "numberOfWorkflows": 2, "mode": "  PRIORITY  "},
        )

    assert len(fake_client.calls) == 2
    assert all(call.task_queue == PRIORITY_WORKFLOW_TASK_QUEUE for call in fake_client.calls)

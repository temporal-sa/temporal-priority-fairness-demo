"""Tests for the FastAPI app and the POST /start-workflows priority branch.

A FakeClient records every start_workflow call (run method, args, id, task_queue,
priority, search_attributes, start_delay) and is substituted for the real Temporal
client via the app's get_client dependency override. The HTTP layer is exercised with
httpx.AsyncClient over an ASGITransport so no live server or Temporal connection runs.

Only OUR mapping is asserted: the count of starts, the workflow ids, the cycling
priorities, the start-time search attributes, and the monotonic non-increasing start
delays. The fairness branch and GET endpoints arrive in later steps.
"""

from collections import Counter
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field
from datetime import timedelta
from random import Random
from typing import Any

import httpx
import pytest
from temporalio.common import SearchAttributePair, TypedSearchAttributes

from priority_fairness import api
from priority_fairness.constants import (
    FAIRNESS_TASK_QUEUE,
    PRIORITY_WORKFLOW_TASK_QUEUE,
    SA_ACTIVITIES_COMPLETED,
    SA_PRIORITY,
)
from priority_fairness.domain import assign_priority, default_fairness_bands
from priority_fairness.search_attributes import (
    ACTIVITIES_COMPLETED_KEY,
    FAIRNESS_KEY_KEY,
    FAIRNESS_WEIGHT_KEY,
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
class FakeExecution:
    """A listed workflow execution exposing only its typed search attributes.

    Mirrors the field the parsers read off temporalio.client.WorkflowExecution
    (confirmed against temporalio 1.28.0: WorkflowExecution.typed_search_attributes).
    """

    typed_search_attributes: TypedSearchAttributes


@dataclass
class FakeClient:
    """Records start_workflow calls and serves fabricated list_workflows results."""

    calls: list[StartCall] = field(default_factory=list)
    executions: list[FakeExecution] = field(default_factory=list)
    list_queries: list[str | None] = field(default_factory=list)

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

    def list_workflows(self, query: str | None = None) -> AsyncIterator[FakeExecution]:
        """Record the query and yield the fabricated executions as an async iterator."""
        self.list_queries.append(query)
        executions = list(self.executions)

        async def _iter() -> AsyncIterator[FakeExecution]:
            for execution in executions:
                yield execution

        return _iter()


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


@pytest.fixture
def seeded_rng() -> Random:
    """Inject a seeded RNG so fairness submission order is deterministic in tests."""
    rng = Random(0)
    api.app.dependency_overrides[api.get_rng] = lambda: rng
    return rng


async def test_post_fairness_round_robins_default_bands_on_fairness_queue(
    fake_client: FakeClient, seeded_rng: Random
) -> None:
    async with _http_client() as client:
        response = await client.post(
            "/start-workflows",
            json={"workflowIdPrefix": "F", "mode": "fairness", "numberOfWorkflows": 6},
        )

    assert response.status_code == 200
    assert response.text == "Done"
    assert len(fake_client.calls) == 6
    assert [call.id for call in fake_client.calls] == [f"F-{n}" for n in range(1, 7)]
    assert all(call.task_queue == FAIRNESS_TASK_QUEUE for call in fake_client.calls)

    bands = default_fairness_bands()
    expected_keys = [bands[(n - 1) % len(bands)].key for n in range(1, 7)]
    assert [call.args[0].fairness_key for call in fake_client.calls] == expected_keys


async def test_post_fairness_sets_search_attributes_with_band_weight(
    fake_client: FakeClient, seeded_rng: Random
) -> None:
    async with _http_client() as client:
        await client.post(
            "/start-workflows",
            json={"workflowIdPrefix": "F", "mode": "fairness", "numberOfWorkflows": 6},
        )

    bands = default_fairness_bands()
    by_key = {band.key: band.weight for band in bands}
    for call in fake_client.calls:
        attrs = call.search_attributes
        key = attrs.get(FAIRNESS_KEY_KEY)
        assert key in by_key
        assert attrs.get(FAIRNESS_WEIGHT_KEY) == by_key[key]
        assert attrs.get(ACTIVITIES_COMPLETED_KEY) == 0
        # The workflow payload carries the band's true weight.
        assert call.args[0].fairness_weight == by_key[key]
        assert call.args[0].disable_fairness is False


async def test_post_fairness_explicit_counts_start_count_sum_multiset(
    fake_client: FakeClient, seeded_rng: Random
) -> None:
    async with _http_client() as client:
        await client.post(
            "/start-workflows",
            json={
                "workflowIdPrefix": "F",
                "mode": "fairness",
                "numberOfWorkflows": 6,
                "bands": [
                    {"key": "a", "weight": 2, "count": 2},
                    {"key": "b", "weight": 1, "count": 3},
                ],
            },
        )

    # Count sum (5) overrides numberOfWorkflows (6).
    assert len(fake_client.calls) == 5
    assert [call.id for call in fake_client.calls] == [f"F-{n}" for n in range(1, 6)]
    key_counts = Counter(call.args[0].fairness_key for call in fake_client.calls)
    assert key_counts == Counter({"a": 2, "b": 3})


async def test_post_fairness_disable_fairness_zeroes_search_attribute_weight(
    fake_client: FakeClient, seeded_rng: Random
) -> None:
    async with _http_client() as client:
        await client.post(
            "/start-workflows",
            json={
                "workflowIdPrefix": "F",
                "mode": "fairness",
                "numberOfWorkflows": 3,
                "disableFairness": True,
            },
        )

    assert len(fake_client.calls) == 3
    for call in fake_client.calls:
        assert call.search_attributes.get(FAIRNESS_WEIGHT_KEY) == 0
        assert call.args[0].disable_fairness is True


def _priority_execution(priority: int, activities_completed: int) -> FakeExecution:
    """A fabricated priority execution with the given priority and step count."""
    return FakeExecution(
        TypedSearchAttributes(
            [
                SearchAttributePair(PRIORITY_KEY, priority),
                SearchAttributePair(ACTIVITIES_COMPLETED_KEY, activities_completed),
            ]
        )
    )


def _fairness_execution(
    fairness_key: str, fairness_weight: int, activities_completed: int
) -> FakeExecution:
    """A fabricated fairness execution with the given key, weight, and step count."""
    return FakeExecution(
        TypedSearchAttributes(
            [
                SearchAttributePair(FAIRNESS_KEY_KEY, fairness_key),
                SearchAttributePair(FAIRNESS_WEIGHT_KEY, fairness_weight),
                SearchAttributePair(ACTIVITIES_COMPLETED_KEY, activities_completed),
            ]
        )
    )


async def test_get_run_status_queries_by_prefix_and_returns_priority_groups(
    fake_client: FakeClient,
) -> None:
    fake_client.executions = [
        _priority_execution(priority=1, activities_completed=5),
        _priority_execution(priority=1, activities_completed=2),
        _priority_execution(priority=3, activities_completed=4),
    ]

    async with _http_client() as client:
        response = await client.get("/run-status", params={"runPrefix": "Run"})

    assert response.status_code == 200
    assert fake_client.list_queries == ['WorkflowId STARTS_WITH "Run"']

    body = response.json()
    groups = body["workflowsByPriority"]
    assert len(groups) == 5
    assert body["totalWorkflowsInTest"] == 3
    assert [group["workflowPriority"] for group in groups] == [1, 2, 3, 4, 5]

    group_one = groups[0]
    assert group_one["numberOfWorkflows"] == 2
    # Steps 1..2 completed by both workflows; steps 3..5 only by the first.
    assert [(a["activityNumber"], a["numberCompleted"]) for a in group_one["activities"]] == [
        (1, 2),
        (2, 2),
        (3, 1),
        (4, 1),
        (5, 1),
    ]

    group_three = groups[2]
    assert group_three["numberOfWorkflows"] == 1
    assert [(a["activityNumber"], a["numberCompleted"]) for a in group_three["activities"]] == [
        (1, 1),
        (2, 1),
        (3, 1),
        (4, 1),
    ]


async def test_get_run_status_fairness_sorts_groups_by_weight_desc(
    fake_client: FakeClient,
) -> None:
    fake_client.executions = [
        _fairness_execution("economy-class", 1, activities_completed=2),
        _fairness_execution("first-class", 15, activities_completed=5),
        _fairness_execution("business-class", 5, activities_completed=3),
    ]

    async with _http_client() as client:
        response = await client.get("/run-status-fairness", params={"runPrefix": "F"})

    assert response.status_code == 200
    assert fake_client.list_queries == ['WorkflowId STARTS_WITH "F"']

    body = response.json()
    groups = body["workflowsByFairness"]
    assert body["totalWorkflowsInTest"] == 3
    assert [group["fairnessWeight"] for group in groups] == [15, 5, 1]
    assert [group["fairnessKey"] for group in groups] == [
        "first-class",
        "business-class",
        "economy-class",
    ]
    assert all(group["numberOfWorkflows"] == 1 for group in groups)
    assert len(groups[0]["activities"]) == 5
    assert len(groups[2]["activities"]) == 2


async def test_get_run_status_requires_run_prefix(fake_client: FakeClient) -> None:
    async with _http_client() as client:
        response = await client.get("/run-status")

    assert response.status_code == 422


async def test_get_run_status_fairness_requires_run_prefix(fake_client: FakeClient) -> None:
    async with _http_client() as client:
        response = await client.get("/run-status-fairness")

    assert response.status_code == 422

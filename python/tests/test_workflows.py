"""Tests for the PriorityWorkflow and FairnessWorkflow orchestration.

These run real Workers against a local WorkflowEnvironment with a recording mock activity
registered under the same name/signature as the real activity. We assert OUR orchestration:
five activity invocations, the ActivitiesCompleted search attribute ends at five, the
workflow returns "Complete", and the activity Priority is set/omitted to match the input.
We do not test the Temporal SDK itself.

The local dev-server environment is used (not start_time_skipping) because the workflows
upsert a custom ActivitiesCompleted search attribute, which must be registered at server
startup via start_local(search_attributes=...). The Java time-skipping test server does
not support registering custom search attributes, so the upsert is rejected there and the
workflow hangs. The workflows have no long durable timers, so time skipping buys nothing
here; a local server runs them effectively instantly.
"""

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from temporalio import activity
from temporalio.common import Priority
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from priority_fairness.constants import (
    FAIRNESS_TASK_QUEUE,
    PRIORITY_ACTIVITY_TASK_QUEUE,
    PRIORITY_WORKFLOW_TASK_QUEUE,
)
from priority_fairness.models import (
    FairnessActivityData,
    FairnessWorkflowData,
    PriorityActivityData,
    PriorityWorkflowData,
)
from priority_fairness.search_attributes import (
    ACTIVITIES_COMPLETED_KEY,
    FAIRNESS_KEY_KEY,
    FAIRNESS_WEIGHT_KEY,
    PRIORITY_KEY,
)
from priority_fairness.workflows import FairnessWorkflow, PriorityWorkflow

# Recorded priorities are captured at module scope so the mock activities (which must
# keep the real activities' name/signature) can append to them. The autouse fixture
# below clears them between tests.
_RECORDED_PRIORITIES: list[Priority] = []


@pytest.fixture(autouse=True)
def _reset_recorded_priorities() -> None:
    _RECORDED_PRIORITIES.clear()


@pytest_asyncio.fixture
async def env() -> AsyncIterator[WorkflowEnvironment]:
    """A local dev-server environment with the demo's custom search attributes registered."""
    async with await WorkflowEnvironment.start_local(
        search_attributes=[
            PRIORITY_KEY,
            ACTIVITIES_COMPLETED_KEY,
            FAIRNESS_KEY_KEY,
            FAIRNESS_WEIGHT_KEY,
        ]
    ) as local_env:
        yield local_env


@activity.defn(name="priority_activity")
async def recording_priority_activity(
    data: PriorityActivityData,
) -> PriorityActivityData:
    _RECORDED_PRIORITIES.append(activity.info().priority)
    return data


@activity.defn(name="fairness_activity")
async def recording_fairness_activity(
    data: FairnessActivityData,
) -> FairnessActivityData:
    _RECORDED_PRIORITIES.append(activity.info().priority)
    return data


async def test_priority_workflow_completes_and_records_activities(
    env: WorkflowEnvironment,
) -> None:
    workflow_id = f"priority-{uuid.uuid4()}"
    async with (
        Worker(
            env.client,
            task_queue=PRIORITY_WORKFLOW_TASK_QUEUE,
            workflows=[PriorityWorkflow],
        ),
        Worker(
            env.client,
            task_queue=PRIORITY_ACTIVITY_TASK_QUEUE,
            activities=[recording_priority_activity],
        ),
    ):
        handle = await env.client.start_workflow(
            PriorityWorkflow.run,
            PriorityWorkflowData(priority=3),
            id=workflow_id,
            task_queue=PRIORITY_WORKFLOW_TASK_QUEUE,
        )
        result = await handle.result()

    assert result == "Complete"
    assert len(_RECORDED_PRIORITIES) == 5

    description = await handle.describe()
    assert description.typed_search_attributes.get(ACTIVITIES_COMPLETED_KEY) == 5


async def test_priority_workflow_sets_activity_priority_key(
    env: WorkflowEnvironment,
) -> None:
    async with (
        Worker(
            env.client,
            task_queue=PRIORITY_WORKFLOW_TASK_QUEUE,
            workflows=[PriorityWorkflow],
        ),
        Worker(
            env.client,
            task_queue=PRIORITY_ACTIVITY_TASK_QUEUE,
            activities=[recording_priority_activity],
        ),
    ):
        handle = await env.client.start_workflow(
            PriorityWorkflow.run,
            PriorityWorkflowData(priority=4),
            id=f"priority-{uuid.uuid4()}",
            task_queue=PRIORITY_WORKFLOW_TASK_QUEUE,
        )
        await handle.result()

    assert len(_RECORDED_PRIORITIES) == 5
    assert all(p.priority_key == 4 for p in _RECORDED_PRIORITIES)


async def test_fairness_workflow_enabled_completes_with_fairness_priority(
    env: WorkflowEnvironment,
) -> None:
    workflow_id = f"fairness-{uuid.uuid4()}"
    async with Worker(
        env.client,
        task_queue=FAIRNESS_TASK_QUEUE,
        workflows=[FairnessWorkflow],
        activities=[recording_fairness_activity],
    ):
        handle = await env.client.start_workflow(
            FairnessWorkflow.run,
            FairnessWorkflowData(
                fairness_key="business-class",
                fairness_weight=5,
                disable_fairness=False,
            ),
            id=workflow_id,
            task_queue=FAIRNESS_TASK_QUEUE,
        )
        result = await handle.result()

    assert result == "Complete"
    assert len(_RECORDED_PRIORITIES) == 5
    assert all(p.fairness_key == "business-class" for p in _RECORDED_PRIORITIES)
    assert all(p.fairness_weight == 5.0 for p in _RECORDED_PRIORITIES)

    description = await handle.describe()
    assert description.typed_search_attributes.get(ACTIVITIES_COMPLETED_KEY) == 5


async def test_fairness_workflow_disabled_omits_fairness_priority(
    env: WorkflowEnvironment,
) -> None:
    async with Worker(
        env.client,
        task_queue=FAIRNESS_TASK_QUEUE,
        workflows=[FairnessWorkflow],
        activities=[recording_fairness_activity],
    ):
        handle = await env.client.start_workflow(
            FairnessWorkflow.run,
            FairnessWorkflowData(
                fairness_key="business-class",
                fairness_weight=5,
                disable_fairness=True,
            ),
            id=f"fairness-{uuid.uuid4()}",
            task_queue=FAIRNESS_TASK_QUEUE,
        )
        result = await handle.result()

    assert result == "Complete"
    assert len(_RECORDED_PRIORITIES) == 5
    assert all(p.fairness_key is None for p in _RECORDED_PRIORITIES)
    assert all(p.fairness_weight is None for p in _RECORDED_PRIORITIES)

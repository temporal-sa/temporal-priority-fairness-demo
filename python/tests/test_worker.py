"""Tests for the worker spec wiring.

The testable logic is the worker spec list (plain data): the three task queues, which
workflows and activities each registers, and which ones cap concurrent activities at 5.
The specs are asserted directly so no worker has to run and Worker internals stay
untouched.
"""

from priority_fairness.activities import fairness_activity, priority_activity
from priority_fairness.constants import (
    FAIRNESS_TASK_QUEUE,
    PRIORITY_ACTIVITY_TASK_QUEUE,
    PRIORITY_WORKFLOW_TASK_QUEUE,
)
from priority_fairness.worker import WorkerSpec, worker_specs
from priority_fairness.workflows import FairnessWorkflow, PriorityWorkflow


def _spec_by_queue(specs: list[WorkerSpec], task_queue: str) -> WorkerSpec:
    return next(spec for spec in specs if spec.task_queue == task_queue)


def test_worker_specs_cover_exactly_the_three_task_queues() -> None:
    specs = worker_specs()

    assert {spec.task_queue for spec in specs} == {
        PRIORITY_WORKFLOW_TASK_QUEUE,
        PRIORITY_ACTIVITY_TASK_QUEUE,
        FAIRNESS_TASK_QUEUE,
    }
    assert len(specs) == 3


def test_priority_workflow_queue_registers_only_the_workflow() -> None:
    spec = _spec_by_queue(worker_specs(), PRIORITY_WORKFLOW_TASK_QUEUE)

    assert spec.workflows == [PriorityWorkflow]
    assert spec.activities == []
    assert spec.max_concurrent_activities is None


def test_priority_activity_queue_registers_only_the_activity_and_caps_concurrency() -> None:
    spec = _spec_by_queue(worker_specs(), PRIORITY_ACTIVITY_TASK_QUEUE)

    assert spec.workflows == []
    assert spec.activities == [priority_activity]
    assert spec.max_concurrent_activities == 5


def test_fairness_queue_registers_workflow_and_activity_and_caps_concurrency() -> None:
    spec = _spec_by_queue(worker_specs(), FAIRNESS_TASK_QUEUE)

    assert spec.workflows == [FairnessWorkflow]
    assert spec.activities == [fairness_activity]
    assert spec.max_concurrent_activities == 5

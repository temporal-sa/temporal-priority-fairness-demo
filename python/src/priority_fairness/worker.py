# ABOUTME: Worker entry point for the priority and fairness demos. Describes the three
# ABOUTME: task-queue workers as plain data, then builds and runs them against one client.

import asyncio
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from temporalio.client import Client
from temporalio.worker import Worker

from priority_fairness.activities import fairness_activity, priority_activity
from priority_fairness.config import connect_client
from priority_fairness.constants import (
    FAIRNESS_TASK_QUEUE,
    MAX_CONCURRENT_ACTIVITIES,
    PRIORITY_ACTIVITY_TASK_QUEUE,
    PRIORITY_WORKFLOW_TASK_QUEUE,
)
from priority_fairness.workflows import FairnessWorkflow, PriorityWorkflow


@dataclass(frozen=True)
class WorkerSpec:
    """A single worker's registrations: its task queue, workflows, activities, and cap."""

    task_queue: str
    workflows: Sequence[type]
    activities: Sequence[Callable[..., Any]]
    max_concurrent_activities: int | None


def worker_specs() -> list[WorkerSpec]:
    """Describe the three demo workers as data.

    The priority demo splits workflows and activities onto separate queues so the
    activity queue can cap concurrency; the fairness demo runs both on one queue.
    """
    return [
        WorkerSpec(
            task_queue=PRIORITY_WORKFLOW_TASK_QUEUE,
            workflows=[PriorityWorkflow],
            activities=[],
            max_concurrent_activities=None,
        ),
        WorkerSpec(
            task_queue=PRIORITY_ACTIVITY_TASK_QUEUE,
            workflows=[],
            activities=[priority_activity],
            max_concurrent_activities=MAX_CONCURRENT_ACTIVITIES,
        ),
        WorkerSpec(
            task_queue=FAIRNESS_TASK_QUEUE,
            workflows=[FairnessWorkflow],
            activities=[fairness_activity],
            max_concurrent_activities=MAX_CONCURRENT_ACTIVITIES,
        ),
    ]


def build_workers(client: Client) -> list[Worker]:
    """Turn each spec into a Worker, passing max_concurrent_activities only when set."""
    workers: list[Worker] = []
    for spec in worker_specs():
        kwargs: dict[str, Any] = {
            "task_queue": spec.task_queue,
            "workflows": list(spec.workflows),
            "activities": list(spec.activities),
        }
        if spec.max_concurrent_activities is not None:
            kwargs["max_concurrent_activities"] = spec.max_concurrent_activities
        workers.append(Worker(client, **kwargs))
    return workers


async def main() -> None:
    """Connect a client and run every worker concurrently until cancelled."""
    client = await connect_client()
    await asyncio.gather(*(worker.run() for worker in build_workers(client)))


if __name__ == "__main__":
    asyncio.run(main())

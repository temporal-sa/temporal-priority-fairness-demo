# ABOUTME: Temporal workflows for the priority and fairness demos. Each runs a fixed loop of
# ABOUTME: activity steps, tags each with a Priority, and upserts ActivitiesCompleted as it goes.

from datetime import timedelta

from temporalio import workflow
from temporalio.common import Priority

from priority_fairness.constants import (
    ACTIVITY_START_TO_CLOSE_SECONDS,
    ACTIVITY_STEPS,
    FAIRNESS_TASK_QUEUE,
    PRIORITY_ACTIVITY_TASK_QUEUE,
)
from priority_fairness.search_attributes import ACTIVITIES_COMPLETED_KEY

with workflow.unsafe.imports_passed_through():
    from priority_fairness.activities import fairness_activity, priority_activity
    from priority_fairness.models import (
        FairnessActivityData,
        FairnessWorkflowData,
        PriorityActivityData,
        PriorityWorkflowData,
    )

_START_TO_CLOSE = timedelta(seconds=ACTIVITY_START_TO_CLOSE_SECONDS)


def _record_step_completed(step: int) -> None:
    """Upsert the ActivitiesCompleted search attribute to the just-completed step count."""
    workflow.upsert_search_attributes([ACTIVITIES_COMPLETED_KEY.value_set(step)])


@workflow.defn
class PriorityWorkflow:
    """Run ACTIVITY_STEPS priority activities, each tagged with the workflow's priority."""

    @workflow.run
    async def run(self, data: PriorityWorkflowData) -> str:
        priority = Priority(priority_key=data.priority)
        for step in range(1, ACTIVITY_STEPS + 1):
            await workflow.execute_activity(
                priority_activity,
                PriorityActivityData(step_number=step, priority=data.priority),
                task_queue=PRIORITY_ACTIVITY_TASK_QUEUE,
                start_to_close_timeout=_START_TO_CLOSE,
                priority=priority,
            )
            _record_step_completed(step)
        return "Complete"


@workflow.defn
class FairnessWorkflow:
    """Run ACTIVITY_STEPS fairness activities, tagging each with a fairness Priority.

    The fairness key and weight are attached to the activity Priority only when fairness
    is enabled; when disabled the activity runs with the default (empty) Priority.
    """

    @workflow.run
    async def run(self, data: FairnessWorkflowData) -> str:
        if data.disable_fairness:
            priority = Priority.default
        else:
            priority = Priority(
                fairness_key=data.fairness_key,
                fairness_weight=float(data.fairness_weight),
            )
        for step in range(1, ACTIVITY_STEPS + 1):
            await workflow.execute_activity(
                fairness_activity,
                FairnessActivityData(
                    step_number=step,
                    fairness_key=data.fairness_key,
                    fairness_weight=data.fairness_weight,
                ),
                task_queue=FAIRNESS_TASK_QUEUE,
                start_to_close_timeout=_START_TO_CLOSE,
                priority=priority,
            )
            _record_step_completed(step)
        return "Complete"

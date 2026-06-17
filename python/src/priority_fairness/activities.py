# ABOUTME: Temporal activities for the priority and fairness demos. Each activity sleeps
# ABOUTME: briefly, appends a timestamped "Activity step [N] completed" line, and returns its input.

import asyncio
from datetime import datetime

from temporalio import activity

from priority_fairness.constants import ACTIVITY_SLEEP_SECONDS
from priority_fairness.models import FairnessActivityData, PriorityActivityData


def _append_step_line(results: list[str], step_number: int) -> None:
    """Append the timestamped completion line for a step to the results list."""
    results.append(f"{datetime.now()} - Activity step [{step_number}] completed")


@activity.defn
async def priority_activity(data: PriorityActivityData) -> PriorityActivityData:
    """Sleep, record the step's completion line, and return the data."""
    await asyncio.sleep(ACTIVITY_SLEEP_SECONDS)
    _append_step_line(data.results, data.step_number)
    return data


@activity.defn
async def fairness_activity(data: FairnessActivityData) -> FairnessActivityData:
    """Sleep, record the step's completion line, and return the data."""
    await asyncio.sleep(ACTIVITY_SLEEP_SECONDS)
    _append_step_line(data.results, data.step_number)
    return data

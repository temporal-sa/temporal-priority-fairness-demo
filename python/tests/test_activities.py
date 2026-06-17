"""Tests for the priority and fairness activities.

The only OUR-logic here is that each activity appends one result line containing
"Activity step [N] completed" and returns the input data object. We do not assert on
the timestamp text or test asyncio.sleep itself.
"""

from temporalio.testing import ActivityEnvironment

from priority_fairness.activities import fairness_activity, priority_activity
from priority_fairness.models import FairnessActivityData, PriorityActivityData


async def test_priority_activity_appends_step_line_and_returns_data() -> None:
    env = ActivityEnvironment()
    data = PriorityActivityData(step_number=2, priority=3, results=[])

    result = await env.run(priority_activity, data)

    assert len(result.results) == 1
    assert "Activity step [2] completed" in result.results[0]


async def test_fairness_activity_appends_step_line_and_returns_data() -> None:
    env = ActivityEnvironment()
    data = FairnessActivityData(step_number=4, fairness_key="economy-class", fairness_weight=1, results=[])

    result = await env.run(fairness_activity, data)

    assert len(result.results) == 1
    assert "Activity step [4] completed" in result.results[0]

# ABOUTME: Tests for priority result aggregation in domain.py: empty -> 5 fixed groups,
# ABOUTME: single view placement, and activity-count accumulation across multiple views.

from priority_fairness.domain import ExecutionView, aggregate_priority


def test_aggregate_priority_empty_returns_five_zeroed_groups() -> None:
    results = aggregate_priority([])

    assert results.total_workflows_in_test == 0
    assert len(results.workflows_by_priority) == 5
    for index, group in enumerate(results.workflows_by_priority):
        assert group.workflow_priority == index + 1
        assert group.number_of_workflows == 0
        assert group.activities == []


def test_aggregate_priority_single_view_lands_in_its_group() -> None:
    results = aggregate_priority([ExecutionView(priority=3, activities_completed=4)])

    assert results.total_workflows_in_test == 1
    group = results.workflows_by_priority[2]
    assert group.workflow_priority == 3
    assert group.number_of_workflows == 1
    assert [a.activity_number for a in group.activities] == [1, 2, 3, 4]
    assert all(a.number_completed == 1 for a in group.activities)

    # Untouched groups stay zeroed.
    for index, other in enumerate(results.workflows_by_priority):
        if index == 2:
            continue
        assert other.number_of_workflows == 0
        assert other.activities == []


def test_aggregate_priority_accumulates_across_views() -> None:
    results = aggregate_priority(
        [
            ExecutionView(priority=1, activities_completed=5),
            ExecutionView(priority=1, activities_completed=2),
        ]
    )

    group = results.workflows_by_priority[0]
    assert group.number_of_workflows == 2
    assert [a.activity_number for a in group.activities] == [1, 2, 3, 4, 5]
    assert [a.number_completed for a in group.activities] == [2, 2, 1, 1, 1]


def test_aggregate_priority_total_counts_all_views() -> None:
    results = aggregate_priority(
        [
            ExecutionView(priority=1, activities_completed=1),
            ExecutionView(priority=2, activities_completed=3),
            ExecutionView(priority=5, activities_completed=5),
        ]
    )

    assert results.total_workflows_in_test == 3
    assert results.workflows_by_priority[0].number_of_workflows == 1
    assert results.workflows_by_priority[1].number_of_workflows == 1
    assert results.workflows_by_priority[4].number_of_workflows == 1

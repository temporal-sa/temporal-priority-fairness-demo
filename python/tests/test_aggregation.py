# ABOUTME: Tests for priority result aggregation in domain.py: empty -> 5 fixed groups,
# ABOUTME: single view placement, and activity-count accumulation across multiple views.

from priority_fairness.domain import (
    ExecutionView,
    FairnessExecutionView,
    aggregate_fairness,
    aggregate_priority,
)


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


def test_aggregate_fairness_sorts_groups_by_weight_descending() -> None:
    results = aggregate_fairness(
        [
            FairnessExecutionView(fairness_key="economy-class", fairness_weight=1, activities_completed=1),
            FairnessExecutionView(fairness_key="first-class", fairness_weight=15, activities_completed=1),
            FairnessExecutionView(fairness_key="business-class", fairness_weight=5, activities_completed=1),
        ]
    )

    assert results.total_workflows_in_test == 3
    assert [g.fairness_weight for g in results.workflows_by_fairness] == [15, 5, 1]
    assert [g.fairness_key for g in results.workflows_by_fairness] == [
        "first-class",
        "business-class",
        "economy-class",
    ]


def test_aggregate_fairness_collapses_same_key_and_weight() -> None:
    results = aggregate_fairness(
        [
            FairnessExecutionView(fairness_key="business-class", fairness_weight=5, activities_completed=1),
            FairnessExecutionView(fairness_key="business-class", fairness_weight=5, activities_completed=1),
        ]
    )

    assert len(results.workflows_by_fairness) == 1
    group = results.workflows_by_fairness[0]
    assert group.fairness_key == "business-class"
    assert group.fairness_weight == 5
    assert group.number_of_workflows == 2


def test_aggregate_fairness_weight_zero_group_sorts_last() -> None:
    results = aggregate_fairness(
        [
            FairnessExecutionView(fairness_key="", fairness_weight=0, activities_completed=1),
            FairnessExecutionView(fairness_key="first-class", fairness_weight=15, activities_completed=1),
            FairnessExecutionView(fairness_key="", fairness_weight=0, activities_completed=1),
        ]
    )

    # The two empty-key, weight-0 views collapse into one group that sorts last.
    assert len(results.workflows_by_fairness) == 2
    assert [g.fairness_weight for g in results.workflows_by_fairness] == [15, 0]
    last = results.workflows_by_fairness[-1]
    assert last.fairness_key == ""
    assert last.fairness_weight == 0
    assert last.number_of_workflows == 2


def test_aggregate_fairness_ties_break_by_key_ascending() -> None:
    results = aggregate_fairness(
        [
            FairnessExecutionView(fairness_key="bravo", fairness_weight=5, activities_completed=1),
            FairnessExecutionView(fairness_key="alpha", fairness_weight=5, activities_completed=1),
        ]
    )

    assert [g.fairness_key for g in results.workflows_by_fairness] == ["alpha", "bravo"]
    assert [g.fairness_weight for g in results.workflows_by_fairness] == [5, 5]


def test_aggregate_fairness_groups_distinct_keys_sharing_zero_weight() -> None:
    # Weight-0 views with different keys are NOT merged: grouping is by (key, weight).
    results = aggregate_fairness(
        [
            FairnessExecutionView(fairness_key="x", fairness_weight=0, activities_completed=1),
            FairnessExecutionView(fairness_key="y", fairness_weight=0, activities_completed=1),
            FairnessExecutionView(fairness_key="", fairness_weight=0, activities_completed=1),
        ]
    )

    assert len(results.workflows_by_fairness) == 3
    assert all(g.fairness_weight == 0 for g in results.workflows_by_fairness)
    assert [g.fairness_key for g in results.workflows_by_fairness] == ["", "x", "y"]
    assert all(g.number_of_workflows == 1 for g in results.workflows_by_fairness)


def test_aggregate_fairness_accumulates_activities_like_priority() -> None:
    results = aggregate_fairness(
        [
            FairnessExecutionView(fairness_key="first-class", fairness_weight=15, activities_completed=5),
            FairnessExecutionView(fairness_key="first-class", fairness_weight=15, activities_completed=2),
        ]
    )

    group = results.workflows_by_fairness[0]
    assert group.number_of_workflows == 2
    assert [a.activity_number for a in group.activities] == [1, 2, 3, 4, 5]
    assert [a.number_completed for a in group.activities] == [2, 2, 1, 1, 1]

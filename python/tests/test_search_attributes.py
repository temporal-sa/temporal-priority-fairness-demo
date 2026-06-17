"""Tests for typed-search-attribute builders and parsers.

Covers the parsers' defaulting: missing ActivitiesCompleted -> 0, missing FairnessKey
-> "", missing FairnessWeight -> 0. Builders are exercised through the parsers and via
direct value reads.
"""

from temporalio.common import (
    SearchAttributeKey,
    SearchAttributePair,
    TypedSearchAttributes,
)

from priority_fairness.constants import (
    SA_ACTIVITIES_COMPLETED,
    SA_FAIRNESS_KEY,
    SA_FAIRNESS_WEIGHT,
    SA_PRIORITY,
)
from priority_fairness.domain import ExecutionView, FairnessExecutionView
from priority_fairness.search_attributes import (
    ACTIVITIES_COMPLETED_KEY,
    FAIRNESS_KEY_KEY,
    FAIRNESS_WEIGHT_KEY,
    PRIORITY_KEY,
    build_fairness_search_attributes,
    build_priority_search_attributes,
    parse_fairness_view,
    parse_priority_view,
)


def test_parse_priority_view_reads_priority_and_completed() -> None:
    attrs = TypedSearchAttributes(
        [
            SearchAttributePair(SearchAttributeKey.for_int(SA_PRIORITY), 2),
            SearchAttributePair(SearchAttributeKey.for_int(SA_ACTIVITIES_COMPLETED), 3),
        ]
    )
    assert parse_priority_view(attrs) == ExecutionView(priority=2, activities_completed=3)


def test_parse_priority_view_defaults_completed_to_zero() -> None:
    attrs = TypedSearchAttributes(
        [SearchAttributePair(SearchAttributeKey.for_int(SA_PRIORITY), 4)]
    )
    assert parse_priority_view(attrs) == ExecutionView(priority=4, activities_completed=0)


def test_parse_fairness_view_reads_key_weight_and_completed() -> None:
    attrs = TypedSearchAttributes(
        [
            SearchAttributePair(
                SearchAttributeKey.for_keyword(SA_FAIRNESS_KEY), "business-class"
            ),
            SearchAttributePair(SearchAttributeKey.for_int(SA_FAIRNESS_WEIGHT), 5),
            SearchAttributePair(SearchAttributeKey.for_int(SA_ACTIVITIES_COMPLETED), 4),
        ]
    )
    assert parse_fairness_view(attrs) == FairnessExecutionView(
        fairness_key="business-class", fairness_weight=5, activities_completed=4
    )


def test_parse_fairness_view_defaults_missing_key_and_weight() -> None:
    attrs = TypedSearchAttributes(
        [SearchAttributePair(SearchAttributeKey.for_int(SA_ACTIVITIES_COMPLETED), 2)]
    )
    assert parse_fairness_view(attrs) == FairnessExecutionView(
        fairness_key="", fairness_weight=0, activities_completed=2
    )


def test_build_priority_search_attributes_sets_priority_and_zero_completed() -> None:
    attrs = build_priority_search_attributes(3)
    assert attrs.get(PRIORITY_KEY) == 3
    assert attrs.get(ACTIVITIES_COMPLETED_KEY) == 0


def test_build_fairness_search_attributes_sets_key_weight_and_zero_completed() -> None:
    attrs = build_fairness_search_attributes("economy-class", 1)
    assert attrs.get(FAIRNESS_KEY_KEY) == "economy-class"
    assert attrs.get(FAIRNESS_WEIGHT_KEY) == 1
    assert attrs.get(ACTIVITIES_COMPLETED_KEY) == 0

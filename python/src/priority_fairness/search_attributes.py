# ABOUTME: Bridges Temporal's typed search attributes to the pure domain views: defines the
# ABOUTME: four SA keys, builds start-time attributes, and parses listed attributes into views.
#
# The four keys (names must match the Java backend and the dev-server / cloud SA scripts):
#   Priority            int     priority band 1..5 set at start of a priority workflow
#   ActivitiesCompleted int     count of completed activity steps, upserted as the workflow runs
#   FairnessKey         keyword fairness band key (e.g. "business-class") for fairness workflows
#   FairnessWeight      int     fairness band weight (0 when fairness is disabled)

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

PRIORITY_KEY = SearchAttributeKey.for_int(SA_PRIORITY)
ACTIVITIES_COMPLETED_KEY = SearchAttributeKey.for_int(SA_ACTIVITIES_COMPLETED)
FAIRNESS_KEY_KEY = SearchAttributeKey.for_keyword(SA_FAIRNESS_KEY)
FAIRNESS_WEIGHT_KEY = SearchAttributeKey.for_int(SA_FAIRNESS_WEIGHT)


def build_priority_search_attributes(priority: int) -> TypedSearchAttributes:
    """Start-time attributes for a priority workflow: its priority and a zero step count."""
    return TypedSearchAttributes(
        [
            SearchAttributePair(PRIORITY_KEY, priority),
            SearchAttributePair(ACTIVITIES_COMPLETED_KEY, 0),
        ]
    )


def build_fairness_search_attributes(fairness_key: str, fairness_weight: int) -> TypedSearchAttributes:
    """Start-time attributes for a fairness workflow: key, weight, and a zero step count.

    The caller passes ``fairness_weight`` already zeroed when fairness is disabled.
    """
    return TypedSearchAttributes(
        [
            SearchAttributePair(FAIRNESS_KEY_KEY, fairness_key),
            SearchAttributePair(FAIRNESS_WEIGHT_KEY, fairness_weight),
            SearchAttributePair(ACTIVITIES_COMPLETED_KEY, 0),
        ]
    )


def parse_priority_view(typed_attrs: TypedSearchAttributes) -> ExecutionView:
    """Parse a listed workflow's typed attributes into a priority view.

    Missing ActivitiesCompleted defaults to 0.
    """
    return ExecutionView(
        priority=typed_attrs.get(PRIORITY_KEY) or 0,
        activities_completed=typed_attrs.get(ACTIVITIES_COMPLETED_KEY) or 0,
    )


def parse_fairness_view(typed_attrs: TypedSearchAttributes) -> FairnessExecutionView:
    """Parse a listed workflow's typed attributes into a fairness view.

    Missing FairnessKey defaults to "" and missing FairnessWeight defaults to 0.
    """
    return FairnessExecutionView(
        fairness_key=typed_attrs.get(FAIRNESS_KEY_KEY) or "",
        fairness_weight=typed_attrs.get(FAIRNESS_WEIGHT_KEY) or 0,
        activities_completed=typed_attrs.get(ACTIVITIES_COMPLETED_KEY) or 0,
    )

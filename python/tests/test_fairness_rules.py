# ABOUTME: Tests for the pure fairness band helpers in domain.py: the default band set
# ABOUTME: and resolve_total_workflows, including the count==0 vs None equivalence.

from priority_fairness.domain import default_fairness_bands, resolve_total_workflows
from priority_fairness.models import Band, WorkflowConfig


def _config(number_of_workflows: int) -> WorkflowConfig:
    return WorkflowConfig.model_validate(
        {"workflowIdPrefix": "Run", "numberOfWorkflows": number_of_workflows}
    )


def test_default_fairness_bands_order_and_counts() -> None:
    bands = default_fairness_bands()
    assert [(b.key, b.weight) for b in bands] == [
        ("first-class", 15),
        ("business-class", 5),
        ("economy-class", 1),
    ]
    assert all(b.count is None for b in bands)


def test_resolve_total_sums_counts_when_present() -> None:
    bands = [
        Band(key="a", weight=3, count=10),
        Band(key="b", weight=2, count=5),
        Band(key="c", weight=1, count=0),
    ]
    assert resolve_total_workflows(_config(100), bands) == 15


def test_resolve_total_uses_number_of_workflows_when_no_counts() -> None:
    bands = [
        Band(key="a", weight=3),
        Band(key="b", weight=2),
    ]
    assert resolve_total_workflows(_config(42), bands) == 42


def test_resolve_total_treats_count_zero_like_none() -> None:
    all_zero = [Band(key="a", weight=3, count=0), Band(key="b", weight=2, count=0)]
    all_none = [Band(key="a", weight=3), Band(key="b", weight=2)]
    assert resolve_total_workflows(_config(7), all_zero) == 7
    assert resolve_total_workflows(_config(7), all_none) == 7


def test_resolve_total_counts_when_some_count_positive() -> None:
    mixed = [Band(key="a", weight=3, count=4), Band(key="b", weight=2, count=0)]
    assert resolve_total_workflows(_config(100), mixed) == 4

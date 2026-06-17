# ABOUTME: Pure domain logic for the priority/fairness demo: priority assignment and
# ABOUTME: fairness band helpers. No Temporal, no I/O, no clock. The API supplies side effects.

from random import Random

from priority_fairness.constants import PRIORITY_LEVELS
from priority_fairness.models import Band, WorkflowConfig


def assign_priority(workflow_num: int) -> int:
    """Map a 1-based workflow number to a priority in 1..PRIORITY_LEVELS, round-robin."""
    return ((workflow_num - 1) % PRIORITY_LEVELS) + 1


def default_fairness_bands() -> list[Band]:
    """The three default fairness bands, highest weight first, with no fixed counts."""
    return [
        Band(key="first-class", weight=15),
        Band(key="business-class", weight=5),
        Band(key="economy-class", weight=1),
    ]


def _has_counts(bands: list[Band]) -> bool:
    """True when at least one band carries a positive count (count==0 counts as no count)."""
    return any(band.count is not None and band.count > 0 for band in bands)


def resolve_total_workflows(config: WorkflowConfig, bands: list[Band]) -> int:
    """Total workflows to start: sum of band counts when any are set, else the config value."""
    if _has_counts(bands):
        return sum(band.count or 0 for band in bands)
    return config.number_of_workflows


def _expand_by_counts(bands: list[Band]) -> list[Band]:
    """Flatten bands into one entry per unit of count, e.g. count=3 yields three entries."""
    expanded: list[Band] = []
    for band in bands:
        expanded.extend([band] * (band.count or 0))
    return expanded


def build_submission_order(
    bands: list[Band], number_of_workflows: int, rng: Random
) -> list[Band]:
    """Order in which to submit fairness workflows.

    When any band carries a positive count, expand each band by its count and shuffle the
    flat list with the injected ``rng`` so the order is deterministic in tests. Otherwise
    round-robin the bands until ``number_of_workflows`` entries are produced.
    """
    if _has_counts(bands):
        order = _expand_by_counts(bands)
        rng.shuffle(order)
        return order
    return [bands[(n - 1) % len(bands)] for n in range(1, number_of_workflows + 1)]

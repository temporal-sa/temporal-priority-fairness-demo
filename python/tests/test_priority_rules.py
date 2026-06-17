# ABOUTME: Tests for the pure priority-assignment rule in domain.py: workflow number
# ABOUTME: maps to a 1..5 priority via round-robin (((n - 1) % 5) + 1).

import pytest

from priority_fairness.domain import assign_priority


@pytest.mark.parametrize(
    ("workflow_num", "expected"),
    [
        (1, 1),
        (5, 5),
        (6, 1),
        (100, 5),
        (3, 3),
    ],
)
def test_assign_priority_cycles_one_through_five(workflow_num: int, expected: int) -> None:
    assert assign_priority(workflow_num) == expected

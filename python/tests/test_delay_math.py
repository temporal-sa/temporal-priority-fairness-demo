# ABOUTME: Tests for the pure start-delay math in domain.py: priority/fairness target
# ABOUTME: offsets (floor/cap) and start_delay's clamp of past targets to zero.

from datetime import datetime, timedelta

from priority_fairness.domain import (
    fairness_target_offset_seconds,
    priority_target_offset_seconds,
    start_delay,
)


def test_priority_target_offset_seconds() -> None:
    assert priority_target_offset_seconds(100) == 10.0
    assert priority_target_offset_seconds(300) == 20.0
    assert priority_target_offset_seconds(0) == 5.0


def test_fairness_target_offset_floor() -> None:
    assert fairness_target_offset_seconds(100) == 7
    assert fairness_target_offset_seconds(10) == 7


def test_fairness_target_offset_mid_range() -> None:
    assert fairness_target_offset_seconds(200) == 15
    assert fairness_target_offset_seconds(300) == 30


def test_fairness_target_offset_cap() -> None:
    assert fairness_target_offset_seconds(440) == 30


def test_start_delay_future_target() -> None:
    now = datetime(2026, 6, 17, 12, 0, 0)
    target = now + timedelta(seconds=8)
    assert start_delay(target, now) == timedelta(seconds=8)


def test_start_delay_past_target_clamps_to_zero() -> None:
    now = datetime(2026, 6, 17, 12, 0, 0)
    target = now - timedelta(seconds=5)
    assert start_delay(target, now) == timedelta(0)

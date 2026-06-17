# ABOUTME: Tests for the wire-contract logic in models.py: camelCase alias parsing,
# ABOUTME: field defaults, unknown-field tolerance, and by_alias response serialization.

from priority_fairness.models import (
    ActivitySummary,
    Band,
    FairnessSummary,
    FairnessTestRunResults,
    PriorityTestRunResults,
    WorkflowConfig,
    WorkflowSummary,
)


def test_workflow_config_parses_camelcase() -> None:
    config = WorkflowConfig.model_validate(
        {
            "workflowIdPrefix": "Run",
            "numberOfWorkflows": 50,
            "mode": "fairness",
            "disableFairness": True,
            "bands": [{"key": "a", "weight": 3, "count": 10}],
        }
    )
    assert config.workflow_id_prefix == "Run"
    assert config.number_of_workflows == 50
    assert config.mode == "fairness"
    assert config.disable_fairness is True
    assert config.bands is not None
    assert config.bands[0].key == "a"
    assert config.bands[0].weight == 3
    assert config.bands[0].count == 10


def test_workflow_config_defaults() -> None:
    config = WorkflowConfig.model_validate({"workflowIdPrefix": "Run"})
    assert config.number_of_workflows == 100
    assert config.disable_fairness is False
    assert config.mode is None
    assert config.bands is None


def test_workflow_config_ignores_unknown_fields() -> None:
    config = WorkflowConfig.model_validate({"workflowIdPrefix": "Run", "extraField": 1})
    assert config.workflow_id_prefix == "Run"
    assert not hasattr(config, "extraField")


def test_band_count_defaults_to_none() -> None:
    band = Band.model_validate({"key": "a", "weight": 3})
    assert band.count is None


def test_band_parses_full_payload() -> None:
    band = Band.model_validate({"key": "b", "weight": 5, "count": 7})
    assert band.key == "b"
    assert band.weight == 5
    assert band.count == 7


def test_priority_results_serialize_by_alias() -> None:
    results = PriorityTestRunResults(
        workflows_by_priority=[
            WorkflowSummary(
                workflow_priority=1,
                number_of_workflows=2,
                activities=[ActivitySummary(activity_number=1, number_completed=2)],
            )
        ],
        total_workflows_in_test=2,
    )
    dumped = results.model_dump(by_alias=True)
    assert set(dumped) == {"workflowsByPriority", "totalWorkflowsInTest"}
    assert dumped["totalWorkflowsInTest"] == 2
    group = dumped["workflowsByPriority"][0]
    assert set(group) == {"workflowPriority", "numberOfWorkflows", "activities"}
    assert group["workflowPriority"] == 1
    assert group["numberOfWorkflows"] == 2
    activity = group["activities"][0]
    assert set(activity) == {"activityNumber", "numberCompleted"}
    assert activity["activityNumber"] == 1
    assert activity["numberCompleted"] == 2


def test_fairness_results_serialize_by_alias() -> None:
    results = FairnessTestRunResults(
        workflows_by_fairness=[
            FairnessSummary(
                fairness_key="first-class",
                fairness_weight=15,
                number_of_workflows=3,
                activities=[ActivitySummary(activity_number=2, number_completed=1)],
            )
        ],
        total_workflows_in_test=3,
    )
    dumped = results.model_dump(by_alias=True)
    assert set(dumped) == {"workflowsByFairness", "totalWorkflowsInTest"}
    assert dumped["totalWorkflowsInTest"] == 3
    group = dumped["workflowsByFairness"][0]
    assert set(group) == {"fairnessKey", "fairnessWeight", "numberOfWorkflows", "activities"}
    assert group["fairnessKey"] == "first-class"
    assert group["fairnessWeight"] == 15
    assert group["numberOfWorkflows"] == 3
    assert group["activities"][0] == {"activityNumber": 2, "numberCompleted": 1}

# ABOUTME: Pydantic models that double as FastAPI request/response bodies and Temporal
# ABOUTME: payloads. JSON is camelCase via field aliases to match the Java backend
# ABOUTME: field-for-field; internal attributes stay snake_case. The React UI reads these
# ABOUTME: exact shapes, so the wire contract is frozen: emit JSON with model_dump(by_alias=True).

from pydantic import BaseModel, ConfigDict, Field


class _CamelModel(BaseModel):
    """Base for request/payload models: accept camelCase or snake_case, ignore extras."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class _FrozenResponse(BaseModel):
    """Base for response models whose camelCase aliases are the frozen UI contract."""

    model_config = ConfigDict(populate_by_name=True)


class Band(_CamelModel):
    key: str
    weight: int
    count: int | None = None


class WorkflowConfig(_CamelModel):
    workflow_id_prefix: str = Field(alias="workflowIdPrefix")
    number_of_workflows: int = Field(default=100, alias="numberOfWorkflows")
    mode: str | None = None
    bands: list[Band] | None = None
    disable_fairness: bool = Field(default=False, alias="disableFairness")


class PriorityWorkflowData(_CamelModel):
    priority: int


class FairnessWorkflowData(_CamelModel):
    fairness_key: str
    fairness_weight: int
    disable_fairness: bool


class PriorityActivityData(_CamelModel):
    step_number: int
    priority: int
    results: list[str] = Field(default_factory=list)


class FairnessActivityData(_CamelModel):
    step_number: int
    fairness_key: str
    fairness_weight: int
    results: list[str] = Field(default_factory=list)


class ActivitySummary(_FrozenResponse):
    activity_number: int = Field(alias="activityNumber")
    number_completed: int = Field(alias="numberCompleted")


class WorkflowSummary(_FrozenResponse):
    workflow_priority: int = Field(alias="workflowPriority")
    number_of_workflows: int = Field(alias="numberOfWorkflows")
    activities: list[ActivitySummary] = Field(default_factory=list)


class PriorityTestRunResults(_FrozenResponse):
    workflows_by_priority: list[WorkflowSummary] = Field(alias="workflowsByPriority")
    total_workflows_in_test: int = Field(alias="totalWorkflowsInTest")


class FairnessSummary(_FrozenResponse):
    fairness_key: str = Field(alias="fairnessKey")
    fairness_weight: int = Field(alias="fairnessWeight")
    number_of_workflows: int = Field(alias="numberOfWorkflows")
    activities: list[ActivitySummary] = Field(default_factory=list)


class FairnessTestRunResults(_FrozenResponse):
    workflows_by_fairness: list[FairnessSummary] = Field(alias="workflowsByFairness")
    total_workflows_in_test: int = Field(alias="totalWorkflowsInTest")

# ABOUTME: Single source of truth for task queue names, search attribute names, and
# ABOUTME: demo tuning constants shared across workflows, worker, search attributes, and API.

from typing import Final

# Task queue names (must match the Java backend and dev-server / cloud setup).
PRIORITY_WORKFLOW_TASK_QUEUE: Final = "PriorityWorkflowTQ"
PRIORITY_ACTIVITY_TASK_QUEUE: Final = "PriorityActivityTQ"
FAIRNESS_TASK_QUEUE: Final = "fairness-queue"

# Search attribute names (must match the Java backend and SA creation scripts).
SA_PRIORITY: Final = "Priority"
SA_ACTIVITIES_COMPLETED: Final = "ActivitiesCompleted"
SA_FAIRNESS_KEY: Final = "FairnessKey"
SA_FAIRNESS_WEIGHT: Final = "FairnessWeight"

# Demo constants.
ACTIVITY_STEPS: Final = 5
ACTIVITY_SLEEP_SECONDS: Final = 0.3
ACTIVITY_START_TO_CLOSE_SECONDS: Final = 5
MAX_CONCURRENT_ACTIVITIES: Final = 5
DEFAULT_NUMBER_OF_WORKFLOWS: Final = 100
PRIORITY_LEVELS: Final = 5
API_PORT: Final = 7080
UI_ORIGIN: Final = "https://localhost:4000"

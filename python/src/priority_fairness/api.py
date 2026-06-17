# ABOUTME: FastAPI app for the priority/fairness demo. Injects a Temporal client via a
# ABOUTME: get_client dependency and starts priority workflows on POST /start-workflows.

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from random import Random
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from temporalio.client import Client, WorkflowExecution

from priority_fairness.config import connect_client
from priority_fairness.constants import (
    FAIRNESS_TASK_QUEUE,
    PRIORITY_WORKFLOW_TASK_QUEUE,
    UI_ORIGIN,
)
from priority_fairness.domain import (
    aggregate_fairness,
    aggregate_priority,
    assign_priority,
    build_submission_order,
    default_fairness_bands,
    fairness_target_offset_seconds,
    priority_target_offset_seconds,
    resolve_total_workflows,
    start_delay,
)
from priority_fairness.models import (
    FairnessWorkflowData,
    PriorityWorkflowData,
    WorkflowConfig,
)
from priority_fairness.search_attributes import (
    build_fairness_search_attributes,
    build_priority_search_attributes,
    parse_fairness_view,
    parse_priority_view,
)
from priority_fairness.workflows import FairnessWorkflow, PriorityWorkflow


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Connect the Temporal client on startup and store it on app.state."""
    app.state.temporal_client = await connect_client()
    yield
    app.state.temporal_client = None


app = FastAPI(lifespan=lifespan)
app.state.temporal_client = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[UI_ORIGIN],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def get_client() -> Client:
    """Return the connected Temporal client; tests override this dependency."""
    client: Client | None = app.state.temporal_client
    if client is None:
        raise RuntimeError("Temporal client is not connected")
    return client


def get_rng() -> Random:
    """Return the RNG used to shuffle fairness submission order; tests override this."""
    return Random()


def _normalize_mode(mode: str | None) -> str:
    """Map a raw mode to 'fairness' or 'priority'.

    None, empty, or any value other than 'fairness' (case-insensitive, trimmed) is
    treated as priority mode.
    """
    if mode is not None and mode.strip().lower() == "fairness":
        return "fairness"
    return "priority"


async def _start_priority_workflows(client: Client, config: WorkflowConfig) -> None:
    """Start one priority workflow per configured workflow, cycling priorities 1..5.

    All workflows share a single target time so each start delay shrinks as the loop
    advances. The activity priority is set inside the workflow, so no workflow-level
    priority is passed at start.
    """
    total = config.number_of_workflows
    target = datetime.now() + timedelta(seconds=priority_target_offset_seconds(total))
    for n in range(1, total + 1):
        priority = assign_priority(n)
        await client.start_workflow(
            PriorityWorkflow.run,
            PriorityWorkflowData(priority=priority),
            id=f"{config.workflow_id_prefix}-{n}",
            task_queue=PRIORITY_WORKFLOW_TASK_QUEUE,
            search_attributes=build_priority_search_attributes(priority),
            start_delay=start_delay(target, datetime.now()),
        )


async def _start_fairness_workflows(client: Client, config: WorkflowConfig, rng: Random) -> None:
    """Start fairness workflows on the fairness queue, one per submission-order slot.

    Bands come from the config or the defaults. The total is the sum of band counts when
    any are set, else the config value. The submission order is shuffled by ``rng`` (or
    round-robined when no counts are set) so tests stay deterministic. When fairness is
    disabled, every search-attribute weight is zeroed while the workflow payload keeps the
    band's true weight.
    """
    bands = config.bands or default_fairness_bands()
    total = resolve_total_workflows(config, bands)
    order = build_submission_order(bands, total, rng)
    target = datetime.now() + timedelta(seconds=fairness_target_offset_seconds(total))
    for index, band in enumerate(order, start=1):
        weight = 0 if config.disable_fairness else band.weight
        await client.start_workflow(
            FairnessWorkflow.run,
            FairnessWorkflowData(
                fairness_key=band.key,
                fairness_weight=band.weight,
                disable_fairness=config.disable_fairness,
            ),
            id=f"{config.workflow_id_prefix}-{index}",
            task_queue=FAIRNESS_TASK_QUEUE,
            search_attributes=build_fairness_search_attributes(band.key, weight),
            start_delay=start_delay(target, datetime.now()),
        )


@app.post("/start-workflows", response_class=PlainTextResponse)
async def start_workflows(
    config: WorkflowConfig,
    client: Annotated[Client, Depends(get_client)],
    rng: Annotated[Random, Depends(get_rng)],
) -> str:
    """Start a batch of demo workflows, dispatching by mode (priority or fairness)."""
    mode = _normalize_mode(config.mode)
    if mode == "fairness":
        await _start_fairness_workflows(client, config, rng)
    else:
        await _start_priority_workflows(client, config)
    return "Done"


async def _list_executions(client: Client, run_prefix: str) -> list[WorkflowExecution]:
    """List every workflow whose id starts with ``run_prefix`` for this run."""
    query = f'WorkflowId STARTS_WITH "{run_prefix}"'
    return [execution async for execution in client.list_workflows(query)]


@app.get("/run-status")
async def run_status(
    runPrefix: str,  # noqa: N803 (camelCase query param matches the frozen UI contract)
    client: Annotated[Client, Depends(get_client)],
) -> JSONResponse:
    """Aggregate the priority workflows for this run into the frozen 5-group shape."""
    executions = await _list_executions(client, runPrefix)
    views = [parse_priority_view(execution.typed_search_attributes) for execution in executions]
    results = aggregate_priority(views)
    return JSONResponse(results.model_dump(by_alias=True))


@app.get("/run-status-fairness")
async def run_status_fairness(
    runPrefix: str,  # noqa: N803 (camelCase query param matches the frozen UI contract)
    client: Annotated[Client, Depends(get_client)],
) -> JSONResponse:
    """Aggregate the fairness workflows for this run, sorted by weight descending."""
    executions = await _list_executions(client, runPrefix)
    views = [parse_fairness_view(execution.typed_search_attributes) for execution in executions]
    results = aggregate_fairness(views)
    return JSONResponse(results.model_dump(by_alias=True))

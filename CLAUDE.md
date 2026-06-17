# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A Temporal demo of two Task Queue features that went GA in Temporal Server 1.31: **Priority** (rank work 1-5) and **Fairness** (weighted dispatch across tenant bands so big tenants don't starve small ones). A Spring Boot worker runs the workflows and exposes a REST API; a React/Vite UI starts runs and renders per-group progress.

This branch (`python`) currently contains the Java implementation. The repo keeps per-language branches: `main` (Java) plus `golang` and `python` remotes.

## Commands

Backend (run from repo root; uses the Maven wrapper):
- Build/package: `./mvnw clean package`
- Run worker + API against a local server: `./startlocalworker.sh` (wraps `./mvnw spring-boot:run`)
- Run worker against Temporal Cloud: `./startcloudworker.sh <temporal-cli-env>` (or set `TEMPORAL_NAMESPACE`/`TEMPORAL_ADDRESS`/`TEMPORAL_KEY_PATH`/`TEMPORAL_CERT_PATH` and run with no arg). Uses the `tc` Spring profile (`application-tc.yaml`).
- Run all tests: `./mvnw test`
- Run a single test: `./mvnw test -Dtest=PriorityServiceApplicationTests#contextLoads`

Note: the only test is `contextLoads`, which boots the full Spring context and therefore needs a reachable Temporal server (defaults to `127.0.0.1:7233`).

Local Temporal server: `./startlocalserver.sh` starts `temporal server start-dev` with `matching.enableFairness=true` and recreates the search attributes (the dev server is in-memory, so they must be recreated every start). Server UI at http://localhost:8233.

UI (from `ui/`):
- Install: `npm ci`
- Dev server: `npm run dev` (HTTPS via mkcert at https://localhost:4000)
- Lint: `npm run lint`
- Build: `npm run build`

Full local demo: three terminals in order: `./startlocalserver.sh`, `./startlocalworker.sh`, `ui/startwebui.sh`. See `SHORT.md` for the demo talk track.

## Prerequisites

- Temporal Server 1.31+ (CLI 1.4+). Priority needs no config (the new matcher is default-on). Fairness requires `matching.enableFairness=true`; without it, fairness keys/weights are ignored and dispatch falls back to approximate FIFO.
- Required search attributes: `Priority` (int), `ActivitiesCompleted` (int), `FairnessKey` (keyword), `FairnessWeight` (int). Create with `./createlocalsearchattributes.sh` (dev server, `temporal` CLI) or `./createcloudsearchattributes.sh` (Cloud, `tcld` CLI).

## Architecture

What makes the demo visible: activity executors are deliberately capped at **5 concurrent** (`max-concurrent-activity-executors: 5` in `application.yaml`). Submitting ~100 workflows builds a backlog at that bottleneck, so priority ordering / fairness weighting becomes observable. Changing that cap changes the whole demo behavior.

Two independent task-queue topologies, one per mode (configured under `spring.temporal.workers` in `src/main/resources/application.yaml`):
- **Priority mode**: `PriorityWorkflow` runs on `PriorityWorkflowTQ`; its activities run on a separate `PriorityActivityTQ` worker (the one capped at 5). Each workflow sets an activity `Priority` key 1-5.
- **Fairness mode**: `FairnessWorkflow` and `FairnessActivity` share a single `fairness-queue` worker. Each workflow sets a fairness key + weight on its activity priority.

Workers and beans are wired by Temporal's Spring Boot starter: `workersAutoDiscovery` scans `com.demo.priority`, and `@WorkflowImpl` / `@ActivityImpl` annotations register implementations against the named workers in the YAML. Task-queue names are looked up at runtime by worker name from `TemporalProperties` (see `getActivityTaskQueueName()` / `getWorkflowTaskQueueName()`), not hardcoded in the workflow code.

Each workflow runs 5 activity steps in a loop; each step sleeps 300ms (`PriorityActivityImpl.pause`) and then upserts the `ActivitiesCompleted` search attribute. Progress is tracked entirely through search attributes. There is no database.

Request flow (`PriorityRESTController`):
- `POST /start-workflows` (body = `WorkflowConfig`): starts N workflows. Priority is assigned round-robin `((n-1) % 5) + 1`. Fairness bands default to first-class (15) / business-class (5) / economy-class (1); bands can carry explicit `count`s (the submission list is then built and shuffled to randomize arrival order). A staggered `setStartDelay` makes all workflows begin at roughly the same time (priority and fairness use different delay formulas). The `disableFairness` flag zeroes the weight and skips setting the activity priority, to demo the FIFO-fallback contrast.
- `GET /run-status?runPrefix=` and `GET /run-status-fairness?runPrefix=`: list executions via `WorkflowId STARTS_WITH "<prefix>"`, read typed search attributes, and aggregate into per-priority or per-band summaries (`PriorityTestRunResults` / `FairnessTestRunResults`).

Worker API listens on `:7080`. CORS allows `https://localhost:4000`. The Vite dev server proxies `/api/*` to `http://localhost:7080` and **strips the `/api` prefix** (`vite.config.js`), so backend routes have no `/api` prefix.

## Layout

- `src/main/java/com/demo/priority/service/` - `PriorityRESTController` (entry point for runs and status), `PriorityServiceApplication` (Spring Boot main).
  - `workflows/`, `activities/` - interface + `@WorkflowImpl`/`@ActivityImpl` pairs for both modes.
  - `model/` - Lombok `@Data` DTOs: request config (`WorkflowConfig`, `Band`), workflow/activity inputs, and result aggregates.
- `ui/src/` - React 19 + MUI + react-query + react-router + recharts. `features/form` submits a run; `features/results` polls status and renders progress.
- Helper scripts (repo root): `start*.sh`, `create*searchattributes.sh`, `setcloudenv.sh`.

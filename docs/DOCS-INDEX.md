# Documentation Framework Index

This folder contains the simplified human-agent app development framework.

The active framework uses fewer source docs plus a compiled project board. Expanded legacy docs are kept under `docs/legacy-expanded-framework/` for migration/audit reference, but active agents should follow `AGENTS.md` and the active docs listed here.

## Human Action Legend
- `YES` - human is expected to actively provide or decide important content
- `REVIEW AND CHANGE` - AI drafts first; human reviews and adjusts
- `OPTIONAL` - only use when relevant to this app
- `NO` - mainly AI-maintained; human checks only when needed

## Active Docs
- `00-app-definition.md` - app purpose, mode, scope, success criteria, real-vs-mocked decisions
- `01-product-and-ux.md` - personas, journeys, product requirements, UX direction, design system direction
- `02-system-design.md` - domain/data model, architecture, integrations, APIs/contracts
- `03-safety-and-permissions.md` - auth, privacy, permissions, sensitive data, compliance, abuse cases
- `04-quality-and-release.md` - engineering quality, tests, validation, delivery, launch, release/runbook
- `05-agent-workflow.md` - board-plan standard, task contracts, orchestration, approval gates
- `06-current-state.md` - current readiness, blockers, done/in-progress/next
- `07-decision-log.md` - durable decisions and rationale
- `08-existing-project-migration-runbook.md` - instructions for AI agents migrating old-framework projects
- `09-human-interview-guide.md` - plain-language interview script for collecting source-doc details from layman humans
- `10-board-compiler-runbook.md` - deterministic algorithm for compiling docs into an EPIC > wave > task board
- `11-execution-runbook.md` - end-to-end execution loop, primitive harness mode, review/test gates, failure recovery
- `12-coverage-and-success-gates.md` - definitions of ready/done, coverage matrices, launch success gates


## Execution Surface
- `project/index.html` - compiled project plan and execution board for target projects

The board should be populated per target project with:
- EPIC > wave > task hierarchy
- dependencies and parallelization rules
- assumptions and review blockers
- subagent-ready task contracts
- integration contracts
- validation and launch tasks
- approval status

## Suggested Usage For New Projects
1. Fill or approve `00-app-definition.md`.
2. Let AI draft `01`-`05` from the app definition and human inputs.
3. If details are missing, AI uses `09-human-interview-guide.md` to interview the human.
4. Human reviews source docs until ready for the selected mode.
5. AI uses `10-board-compiler-runbook.md` to compile `project/index.html` into a full EPIC > wave > task board plan.
6. AI verifies coverage using `12-coverage-and-success-gates.md`.
7. Human approves the compiled board plan.
8. Coding orchestrator executes ready tasks using `11-execution-runbook.md`.
9. Launch validation runs before completion or deployment.

## Suggested Usage For Existing Projects
1. Preserve existing docs and board data before migration.
2. Map old docs into active docs `00`-`05` by ownership area.
3. Update `06-current-state.md` and `07-decision-log.md`.
4. Recompile or migrate the board plan.
5. Validate no requirement, permission, API, quality gate, or launch check was lost.
6. Resume coding only after source readiness and board approval are restored.

## Superseded Expanded Docs
Expanded old-framework docs live in `docs/legacy-expanded-framework/`. Use them only for migration/audit/reference unless the human explicitly requests analysis of the old framework. They are not active source truth.

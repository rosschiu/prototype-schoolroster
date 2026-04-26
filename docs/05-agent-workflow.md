# Agent Workflow

- Human Action: REVIEW AND CHANGE
- Status: Draft
- Owner: Framework default, human adjustable
- Inputs: `docs/00-app-definition.md`, `docs/04-quality-and-release.md`, `AGENTS.md`, and `project/index.html`
- Owns: Human-agent workflow, board-plan standard, task contract standard, integration contract depth, orchestrator rules, approval gates, and stop conditions
- Must Not Repeat: App-specific product, UX, architecture, security, or release decisions already defined elsewhere
- Update Trigger: Change in collaboration model, board schema, approval gates, task contract, orchestration, or validation expectations
- Mode Applicability: Any

## Purpose
Define how humans, planning agents, coding orchestrators, and coding subagents collaborate from app definition through launch validation.

`AGENTS.md` is the concise runtime contract. This doc is the extended framework standard.

Tag legend:
- `HMN` = must come from human
- `AIH` = AI suggests, human refines
- `OPT` = optional

## Source Of Truth Order
When instructions conflict, follow this order:
1. `docs/03-safety-and-permissions.md`
2. `docs/00-app-definition.md`
3. `docs/01-product-and-ux.md`
4. `docs/02-system-design.md`
5. `docs/04-quality-and-release.md`
6. Approved board plan in `project/index.html`
7. Current task specification
8. `docs/06-current-state.md`
9. `docs/07-decision-log.md`

## Standard Workflow
1. Human defines or approves app definition.
2. AI drafts product/UX, system design, safety, and quality/release docs.
3. Human reviews and changes source docs until ready.
4. Planning AI compiles source docs into the board plan.
5. Human approves the compiled board plan and implementation details.
6. Coding orchestrator executes ready tasks autonomously within approved boundaries.
7. Integration tasks converge work at wave boundaries.
8. Validation tasks prove code-level, integration, journey, and launch readiness.
9. Human performs final acceptance and approves deployment when required.

## Board As Compiled Project Plan
`project/index.html` owns:
- implementation hierarchy
- EPIC > wave > task graph
- dependencies and parallelization
- assumptions and review blockers
- subagent-ready task contracts
- integration contracts
- validation coverage
- execution status

Docs own source truth. The board owns implementation planning and execution state.

## Mandatory Board Hierarchy
Allowed board item types:
- `epic` - product or technical capability
- `wave` - sequenced delivery slice under one epic
- `task` - independently executable implementation unit under one wave
- `integration` - convergence item wiring multiple tasks into one behavior
- `validation` - automated/manual proof of wave, journey, or launch readiness
- `spike` - investigation; not implementation unless converted to task

Rules:
- every task/integration/validation item sits under a wave
- every wave sits under an epic
- every epic has validation coverage
- every wave ends with validation; add integration first when needed
- no item becomes `ready` unless dependencies, contracts, and validation are complete

## Subagent Task Contract
Every implementation task should include:
- objective
- user/system value
- context summary
- owned paths
- allowed touch points
- integration surface
- input contract
- output contract
- implementation steps
- dependency context
- parallelization/conflict paths
- quality gate
- acceptance criteria
- handoff expectations

The task should positively describe where the work plugs into the existing app, what it consumes/produces, and what proof shows it is reachable through the normal app path.

## Integration Contract Depth
Use the lightest depth that removes ambiguity.

### Level 1 - Interface Contract
Required for every implementation task:
- owned paths
- allowed touch points
- route/API/module names
- input/output shape
- relevant permission rule
- test proof

### Level 2 - Flow Contract
Required when UI, API/service, state, or persistence interact:
- trigger
- step-by-step system behavior
- persistence/API/service effects
- success and failure behavior
- journey-level validation

### Level 3 - Pseudocode Contract
Required for complex logic:
- permissions/authorization branching
- payments/billing
- external integrations
- imports/exports
- background jobs
- state machines
- AI workflows
- data reconciliation/migration
- nontrivial error handling

## Dependency And Parallelization Rules
Each executable item should include:
- `deps`
- `blocks` where known
- `parallel_group`
- `parallel_safe`
- `conflict_paths`
- `must_run_after`
- `must_complete_before`

Parallelization rules:
- shared high-risk files require sequencing or integration ownership
- migrations/schema changes should be sequential or centrally owned
- global app shell/routing/auth changes should be sequential or integrated deliberately
- integration and validation tasks run after their implementation wave unless explicitly planned otherwise

## Coding Permission Rule
Coding may start only when all are true:
1. source docs required by scope are ready
2. compiled board plan is human-approved
3. target item is `ready`
4. target item has valid hierarchy
5. task and integration contracts are complete
6. dependencies are satisfied
7. no blocking human decision or assumption applies

## Orchestrator Autonomy
After human approval of the compiled board plan, the orchestrator may:
- select ready tasks
- delegate to coding subagents
- run reviews
- run tests
- fix issues
- mark tasks done
- run integration and validation tasks
- continue until launch validation is complete

Routine implementation inside the approved plan should not wait for human approval.

## Stop And Ask Triggers
Stop and ask when:
- requirements conflict
- docs and board disagree materially
- scope expands materially
- new dependency is needed without prior approval
- architecture, auth, permissions, data model, or integration contracts must change materially
- security/privacy risk appears
- data loss/destructive action is possible
- required validation cannot pass for reasons outside the task
- launch readiness would be weakened

## Review And Test Gates
- Per task: targeted tests plus relevant static/type/lint checks and review.
- Per integration item: affected integration tests and app wiring checks.
- Per wave: relevant suite plus journey checks.
- Launch: clean install, build/start, full required suite, platform E2E, release/runbook validation.

## Board Approval Checklist
Before coding starts, human can review:
- approval status
- source-doc readiness
- EPIC/wave/task counts
- unresolved assumptions
- high-risk tasks
- dependency/parallelization issues
- missing task contracts
- validation coverage
- launch readiness plan

## Completion Standard
The orchestrator is complete only when:
- all approved tasks are done or explicitly deferred with approval
- all integration tasks are done
- all required validation tasks pass or have approved exceptions
- app starts from documented commands
- required user journeys pass
- board/current state/decision log are updated
- final report lists changes, tests, risks, and follow-up items

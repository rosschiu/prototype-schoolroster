# AGENTS.md

This file is the operating contract for coding agents in repos generated from this framework.

## Goal
Help the human define the app clearly, compile the approved definition into a complete board plan, then implement it in a controlled way with minimal guessing.

## Read First
Always read:
1. `docs/00-app-definition.md`
2. `docs/06-current-state.md`
3. `docs/07-decision-log.md`
4. `project/index.html`

Read additionally by task type:
- Product behavior or UX/UI -> `docs/01-product-and-ux.md`
- Data/domain/architecture/integrations/API -> `docs/02-system-design.md`
- Security/privacy/permissions -> `docs/03-safety-and-permissions.md`
- Quality/tests/release/operations -> `docs/04-quality-and-release.md`
- Planning/orchestration/task contracts -> `docs/05-agent-workflow.md`
- Human intake/interviewing -> `docs/09-human-interview-guide.md`
- Board compilation -> `docs/10-board-compiler-runbook.md`
- End-to-end execution -> `docs/11-execution-runbook.md`
- Coverage/readiness/success gates -> `docs/12-coverage-and-success-gates.md`

Superseded expanded docs are stored under `docs/legacy-expanded-framework/` when present. Do not treat legacy docs as active source truth unless the human explicitly asks for migration analysis.

## Human Action Semantics
Every active doc has `Human Action` at the top.

- `YES`
  - Human must provide or decide core content.
  - Do not invent the source truth.
- `REVIEW AND CHANGE`
  - AI drafts first, then expects human review.
  - Do not treat the draft as final if it changes scope, architecture, UX, security, or release behavior.
- `OPTIONAL`
  - Use only when relevant.
- `NO`
  - Maintain automatically as part of normal work.

## Hard Gates
Do not skip these.

- Do not start real implementation before app definition, product/UX, system design, safety, and quality expectations are approved enough for the selected mode.
- Do not start real implementation before the compiled board plan in `project/index.html` is approved by the human.
- Do not implement from vague docs or incomplete board tasks.
- Do not enter release readiness before required scenario and launch validation are complete for the selected mode.
- Do not deploy without explicit human approval when the app is MVP/Production or any real data/system is affected.

If approval state is unclear, stop and ask.

## Coding Permission Rule
You may start coding only when all 6 are true:
1. required source docs are marked `READY` in `docs/06-current-state.md`
2. the compiled board plan in `project/index.html` is human-approved
3. the target board item is marked `ready`
4. the target item has valid EPIC > wave > task/integration/validation hierarchy
5. the target item has a complete subagent task contract and integration contract
6. no blocking human decision, assumption, or approval item applies

If any of these is false:
- do planning, drafting, clarification, review, or migration work only
- do not start implementation

## Workflow
Follow this default workflow unless the human explicitly asks for a simpler path.

### Phase 1 - Define
1. App definition and mode
2. Product and UX definition
3. System design
4. Safety/permissions definition
5. Quality/release definition
6. Guided human interview and source-doc readiness check when details are missing

### Phase 2 - Plan
7. Compile source docs into the board plan using `docs/10-board-compiler-runbook.md`
8. Add EPIC > wave > task hierarchy
9. Add dependencies, parallelization rules, task contracts, integration contracts, and validation tasks
10. Verify coverage using `docs/12-coverage-and-success-gates.md`
11. Ask human to approve the compiled board plan

### Phase 3 - Build
12. Execute implementation waves using `docs/11-execution-runbook.md`
13. Run task-level review and tests
14. Run integration and convergence tasks
15. Run wave validation

### Phase 4 - Ship
16. Run launch validation
17. Run orphan detection and clean-room launch checks where feasible
18. Prepare release readiness
19. Deploy only with required human approval
20. Stabilize after deploy

## Board Rule
`project/index.html` is the compiled project plan and local execution interface for a target project.

Do not use the reusable framework board to track framework-internal work. In the framework source, the board should remain a clean template.

Implement only from board items that are clearly ready:
- status is `ready`
- parent hierarchy is EPIC > wave > task/integration/validation
- dependencies are satisfied
- source docs or source summaries are linked
- linked source IDs have coverage in the board matrices
- subagent task contract exists
- integration contract exists at the required depth
- quality gate and acceptance criteria are testable

If any of those are missing, do planning/clarification work only.

Board item types:
- `epic` - product or technical capability
- `wave` - sequenced delivery slice under one epic
- `task` - independently executable implementation unit
- `integration` - convergence item that wires multiple tasks into one app behavior
- `validation` - test/launch/scenario proof item
- `spike` - planning or investigation; not implementation unless converted to a task

Task status semantics:
- `draft` - planning only, not ready for human review or coding
- `review` - waiting for human confirmation or upstream clarification
- `ready` - coding allowed if the Coding Permission Rule is satisfied
- `doing` - implementation in progress
- `blocked` - cannot proceed because of dependency, missing input, or decision
- `done` - implementation complete for the current scope

## Orchestrator Autonomy
After the compiled board plan is approved, the coding orchestrator may continue executing ready tasks, delegating work, running reviews, fixing issues, and running tests without waiting for human approval for each routine step.

The orchestrator must still obey approval boundaries and stop when work exceeds the approved plan.

## Approval Boundaries
Require human approval before:
- adding a new dependency unless pre-approved in the board plan
- changing architecture significantly
- changing auth, permissions, or data model rules with meaningful impact
- changing integration contracts materially
- changing major UX patterns
- making destructive or irreversible changes
- weakening validation, release, rollback, or security expectations

## Stop And Ask
Stop and ask when:
- requirements conflict
- docs and board disagree materially
- source docs are outdated or contradictory
- scope expands materially
- a shortcut conflicts with app mode or quality profile
- security/privacy risks appear
- production safety may be weakened
- required validation cannot pass for reasons outside the task
- you are unsure which source is authoritative

When uncertain, prefer the stricter interpretation and ask.

## Documentation Rules
- Respect each doc's `Inputs`, `Owns`, and `Must Not Repeat`.
- Do not restate upstream truth in downstream sections unless a short reference is needed.
- If behavior, architecture, controls, or delivery expectations change, update the owning doc.

Minimum ongoing updates when relevant:
- `docs/06-current-state.md`
- `docs/07-decision-log.md`
- `project/index.html`

## Weak-Agent Fallback
If the agent is uncertain, low-capability, or has a primitive harness:
- use `docs/09-human-interview-guide.md` to collect missing details
- use `docs/10-board-compiler-runbook.md` exactly to compile the board
- use `docs/11-execution-runbook.md` in sequential primitive-harness mode
- use `docs/12-coverage-and-success-gates.md` before coding, before each wave, and before launch
- do not rely on unstated inference; stop when a required field or gate is missing

## Checklists

### Before Work
- Read `docs/00-app-definition.md`, `docs/06-current-state.md`, `docs/07-decision-log.md`, and `project/index.html`
- Read task-relevant docs
- Confirm source readiness and testability using `docs/12-coverage-and-success-gates.md`
- Confirm board plan approval
- Confirm the target task is `ready`
- Confirm EPIC > wave > task hierarchy is valid
- Confirm dependencies are satisfied
- Confirm task and integration contracts are complete
- Confirm no pending human decision or blocking assumption applies

### During Work
- Keep changes small and reviewable unless the board plan says otherwise
- Do not silently change architecture, security posture, scope, or delivery rigor
- Avoid unrelated edits
- Keep task detail accurate if implementation reality changes
- Run the task quality gate and required review before marking done

### After Work
- Update task status in `project/index.html`
- Update `docs/06-current-state.md`
- Update `docs/07-decision-log.md` if a meaningful decision changed
- Update any owning docs if project truth changed
- Report what changed, tests run, risks, and follow-up items

## Output Format
When reporting completed work, include:
- what changed
- why it changed
- files affected
- tests run or not run
- risks or follow-up items
- docs updated

## Core Principle
Humans approve judgments.
AI drafts structure, derives downstream artifacts, executes approved implementation, validates integration, and keeps operational state current.

# Board Compiler Runbook

- Human Action: REVIEW AND CHANGE
- Status: Draft
- Owner: Framework default, human approved
- Inputs: Source docs `00`-`05`, `docs/12-coverage-and-success-gates.md`, and blank `project/index.html`
- Owns: Deterministic process for converting approved source docs into a complete EPIC > wave > task board plan
- Must Not Repeat: Full source doc content, app implementation code, or task execution logs
- Update Trigger: Change in board schema, task contract, hierarchy rules, coverage gates, or compilation process
- Mode Applicability: Any

## Purpose
Give even a weak agent a step-by-step algorithm to compile source docs into an end-to-end project board.

The board must be complete enough that a coding agent can execute tasks without rediscovering requirements from the source docs.

## Inputs Required
Before compilation, confirm these docs are ready enough for the selected mode:
- `docs/00-app-definition.md`
- `docs/01-product-and-ux.md`
- `docs/02-system-design.md`
- `docs/03-safety-and-permissions.md`
- `docs/04-quality-and-release.md`
- `docs/05-agent-workflow.md`

If source docs are not testable enough to create tasks and validation, stop and interview the human using `docs/09-human-interview-guide.md`.

## Board Compilation Algorithm
Follow these steps in order.

### Step 1 - Extract Planning Inputs
Create working lists from source docs:
- requirements by ID
- user journeys
- screens/states
- roles/permissions
- domain entities
- data stores/tables
- APIs/contracts
- integrations
- quality gates
- launch criteria
- assumptions and blockers

If an item has no stable ID, assign one:
- `FR-*` for functional requirements
- `JOURNEY-*` for journeys
- `SCREEN-*` for screens/states
- `ENTITY-*` for data/domain items
- `API-*` for APIs/contracts
- `PERM-*` for permission rules
- `VAL-*` for validation criteria

### Step 2 - Create Top-Level Epics
Create epics in this order where relevant:
1. Foundation / app shell / project setup
2. Data model and persistence
3. Auth and permissions
4. Core user journey epics
5. Admin/owner workflows
6. Integrations/import/export/reporting
7. Quality hardening
8. Launch readiness

Each epic must have:
- goal
- linked source IDs
- validation coverage
- risks/assumptions if any

### Step 3 - Create Waves Under Each Epic
Common wave pattern:
1. Foundation/contracts
2. Backend/data/service implementation
3. UI/user flow implementation
4. Integration/convergence
5. Validation

Rules:
- every wave belongs to one epic
- every wave has a clear deliverable
- every wave ends with validation
- add integration wave/task when multiple tasks must converge

### Step 4 - Create Implementation Tasks
For each task, fill the full task contract:
- objective
- user/system value
- context summary
- linked requirements/journeys/screens/entities/APIs/permissions
- owned paths
- allowed touch points
- integration surface
- input contract
- output contract
- implementation steps
- dependencies
- parallelization/conflict paths
- quality gate
- acceptance criteria
- handoff expectations

Task sizing guidance:
- one task should be executable by one agent without requiring broad redesign
- one task should have a small owned path set
- if a task crosses UI + API + data, include Level 2 flow contract
- if a task includes complex logic/security/integration, include Level 3 pseudocode contract

### Step 5 - Add Integration Tasks
Add integration tasks when work from multiple implementation tasks must become one app behavior.

Integration tasks should verify:
- routes/navigation reach the feature
- UI calls the correct service/API
- service/API uses the correct data model
- auth/permissions are enforced
- error/empty/loading states are wired
- feature is visible through the main app shell

### Step 6 - Add Validation Tasks
Add validation tasks for:
- each core user journey
- each permission-sensitive path
- each external integration
- each data migration/seed path
- each launch criterion

For web apps, default to Playwright for core journey validation unless another tool is approved.

Each validation task must include:
- prerequisites
- environment setup
- fixtures/test users/test data
- command to run
- expected outcome
- artifacts to inspect
- failure triage guidance

### Step 7 - Add Launch Readiness Epic
Create launch readiness coverage even for local-only apps.

Minimum launch items:
- clean install
- environment/config validation
- migration/seed validation if applicable
- build/package
- start app from documented command
- code-level tests
- integration tests
- platform E2E journeys
- permission/security checks if applicable
- release/runbook validation

### Step 8 - Add Dependencies
Use dependencies to make execution safe.

Typical ordering:
1. project setup before everything
2. data model before services
3. auth before permission-sensitive features
4. services/APIs before UI that consumes them
5. UI before E2E validation
6. integration before wave validation
7. all core waves before launch validation

Mark conflict paths for:
- package/dependency files
- app shell/layout/routing
- DB schema/migrations
- auth/session/permission files
- shared API contracts
- design system primitives

### Step 9 - Add Coverage Matrices
The board should include or generate these mappings:
- requirement -> task -> validation
- journey -> tasks -> E2E validation
- screen/state -> route/component -> validation
- entity -> schema/service/UI -> test
- API -> implementation -> contract/integration test
- permission -> enforcement point -> validation
- launch criterion -> validation task

### Step 10 - Run Board Readiness Checks
Before human review, verify:
- every task has valid hierarchy
- every ready task has full contract
- every wave has validation
- every epic has validation coverage
- all dependencies point to existing tasks
- must-have requirements have tasks and validation
- core journeys have validation
- permissions have enforcement and validation
- launch readiness epic exists
- blockers/assumptions are visible

### Step 11 - Mark Board For Human Review
Set board approval status to `review`, not `approved`.

Ask human to review:
- app summary
- epics and waves
- core journeys and validation
- assumptions needing human decision
- high-risk tasks
- launch validation coverage

Do not mark the board approved unless human approval is explicit.

## Board Item ID Conventions
Recommended IDs:
- `EPIC-001`
- `WAVE-001`
- `TASK-001`
- `INT-001`
- `VAL-001`
- `LAUNCH-001`
- `ASM-001`

IDs must be stable. Do not renumber completed or referenced items.

## Minimum Task Contract JSON Shape
Use this structure or equivalent board fields:

```json
{
  "id": "TASK-001",
  "type": "task",
  "status": "review",
  "parent": "WAVE-001",
  "deps": [],
  "linked_source": ["FR-001", "JOURNEY-001"],
  "contract": {
    "objective": "",
    "user_value": "",
    "context_summary": "",
    "owned_paths": [],
    "allowed_touch_points": [],
    "integration_surface": {},
    "input_contract": [],
    "output_contract": [],
    "implementation_steps": [],
    "quality_gate": [],
    "acceptance": [],
    "handoff": []
  },
  "parallel": {
    "parallel_safe": false,
    "parallel_group": "",
    "conflict_paths": []
  }
}
```

## Common Compilation Mistakes
Avoid:
- creating tasks directly under epics instead of waves
- creating UI tasks with no route/navigation integration
- creating backend tasks with no caller/test
- creating requirements with no validation
- creating validation tasks with no command or expected result
- marking tasks ready before task contracts are complete
- omitting launch readiness
- assuming the coding agent will reread all source docs

## Output After Compilation
Report:
- number of epics, waves, tasks, integration tasks, validation tasks
- requirements without tasks
- requirements without validation
- assumptions needing human review
- blockers
- board approval status
- whether coding may start

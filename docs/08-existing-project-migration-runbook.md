# Existing Project Migration Runbook

- Human Action: REVIEW AND CHANGE
- Status: Draft
- Owner: Framework default, human approved
- Inputs: Existing expanded-framework project docs, existing `AGENTS.md`, existing `project/index.html`, and new simplified framework docs
- Owns: Step-by-step instructions for an AI coding agent to migrate an existing project from the expanded framework to the simplified framework without losing source truth, board tasks, or quality gates
- Must Not Repeat: Full app requirements, old framework docs, or target project implementation details
- Update Trigger: Change in simplified framework structure, migration safety rules, board schema, or activation process
- Mode Applicability: Any existing project using the old expanded framework

## Purpose
This document is a single migration guide for an AI coding agent.

Use it when an existing project already has the old expanded framework docs and needs to transition to the simplified structure:

```text
docs/00-app-definition.md
docs/01-product-and-ux.md
docs/02-system-design.md
docs/03-safety-and-permissions.md
docs/04-quality-and-release.md
docs/05-agent-workflow.md
docs/06-current-state.md
docs/07-decision-log.md
project/index.html
```

The migration must preserve all project truth, implementation readiness gates, board tasks, quality standards, and launch validation expectations.

## Critical Safety Rules
The AI coding agent must follow these rules exactly.

- Do not implement app features during migration.
- Do not change app behavior during migration.
- Do not delete old docs; after activation, move or keep them in `docs/legacy-expanded-framework/` as superseded references.
- Do not delete board tasks.
- Do not clear the existing project board.
- Do not mark old docs superseded during Pass 1.
- Do not update `AGENTS.md` to the simplified read order during Pass 1.
- Do not mark implementation tasks `ready` unless their hierarchy, dependencies, task contract, integration contract, and quality gates are complete.
- Do not silently drop uncertain, duplicated, or conflicting content.
- If old docs conflict, preserve both facts in the migration report and ask for human review.
- If a quality gate appears impossible to preserve, stop and report the blocker.

## Recommended Migration Model
Use a two-pass migration.

```text
Pass 1: Draft migration and coverage report
Human review / approval
Pass 2: Activation
```

This avoids switching agents to the new structure before the new docs are complete and verified.

## Old-To-New Mapping
Migrate by ownership area, not by copying every sentence.

| Old expanded docs | New simplified doc |
|---|---|
| `docs/00-project-charter.md`, `docs/01-scope-and-mode.md`, key scope parts of `docs/02-product-requirements.md` | `docs/00-app-definition.md` |
| `docs/02-product-requirements.md`, `docs/03-personas-and-flows.md`, `docs/04-ux-ui-direction.md`, `docs/05-design-system-and-theming.md` | `docs/01-product-and-ux.md` |
| `docs/06-domain-model.md`, `docs/07-technical-architecture.md`, `docs/08-integrations.md`, `docs/17-api-contracts.md` | `docs/02-system-design.md` |
| `docs/09-security-privacy-compliance.md`, `docs/16-permissions-matrix.md`, security/risk parts of `docs/15-risk-register.md` | `docs/03-safety-and-permissions.md` |
| `docs/10-engineering-quality.md`, `docs/11-delivery-and-operations.md`, `docs/18-test-strategy.md`, `docs/19-release-runbook.md`, `docs/23-validation-and-launch-standard.md` | `docs/04-quality-and-release.md` |
| `docs/12-human-agent-workflow.md`, `docs/20-board-plan-standard.md`, `docs/21-subagent-task-contract.md`, `docs/22-orchestrator-runbook.md` | `docs/05-agent-workflow.md` |
| `docs/13-current-state.md` | `docs/06-current-state.md` |
| `docs/14-decision-log.md` | `docs/07-decision-log.md` |
| `docs/15-risk-register.md` non-security delivery risks | `docs/04-quality-and-release.md` or board assumptions/risk register |

## Required Quality Preservation Checklist
Before activation, the AI coding agent must verify that the new simplified docs preserve these areas or explicitly mark them not applicable.

- App purpose and success criteria
- Delivery mode
- Scope boundary
- In-scope and out-of-scope items
- Real vs mocked decisions
- Acceptable and unacceptable shortcuts
- Product requirements with stable IDs, if present
- Personas and user journeys
- UX direction and design system guidance
- Screen/state inventory or equivalent UX coverage
- Domain model
- Data model
- Architecture and module boundaries
- Integrations and failure behavior
- API contracts
- Auth model
- Permission matrix / resource rules
- Privacy, sensitive data, and compliance requirements
- Security risks and mitigations
- Quality profile by mode
- Static/type/lint expectations
- Unit/integration/contract test expectations
- Platform E2E expectations, such as Playwright for web apps
- Release, rollback, and runbook expectations
- Launch validation checklist
- Board-plan approval gate
- EPIC > wave > task hierarchy rule
- Subagent-ready task contract rule
- Integration contract depth rule
- Dependency and parallelization rules
- Orchestrator autonomy rules
- Stop-and-ask triggers
- Current state and blockers
- Decision log history

## Pass 1 - Draft Migration

### Goal
Create simplified docs in parallel and produce a migration report. Do not activate the new structure yet.

### Step 1 - Inspect Current Project
Read:
- existing `AGENTS.md`
- existing `docs/DOCS-INDEX.md` if present
- existing old docs `00`-`24` where present
- existing `docs/13-current-state.md`
- existing `docs/14-decision-log.md`
- existing `project/index.html`

Record:
- existing doc list
- existing board task count
- existing board approval status
- tasks currently `doing`, `ready`, or `blocked`
- source docs that are marked `READY`, `REVIEW`, `DRAFT`, or unclear
- known blockers

### Step 2 - Create Migration Snapshot
If safe in the current environment, create a local snapshot:

```bash
mkdir -p migration-snapshot
cp -R docs migration-snapshot/docs-old
cp -R project migration-snapshot/project-old
cp AGENTS.md migration-snapshot/AGENTS-old.md
```

If snapshot commands cannot run, document why in the migration report and avoid destructive edits.

### Step 3 - Create New Simplified Docs In Parallel
Create or update these files as drafts:

```text
docs/00-app-definition.md
docs/01-product-and-ux.md
docs/02-system-design.md
docs/03-safety-and-permissions.md
docs/04-quality-and-release.md
docs/05-agent-workflow.md
docs/06-current-state.md
docs/07-decision-log.md
```

Rules:
- Preserve `Human Action`, `Status`, `Owner`, `Inputs`, `Owns`, `Must Not Repeat`, and `Update Trigger` metadata.
- Use the old docs as inputs.
- Migrate by ownership area.
- If a section is not applicable, say so explicitly.
- If content conflicts, preserve the conflict in `docs/MIGRATION-REPORT.md`.
- Do not update `AGENTS.md` yet.
- Do not mark old docs superseded yet.

### Step 4 - Draft `docs/06-current-state.md`
The new current state should say migration is in review.

Required content:
- migration phase: `REVIEW`
- old docs still available and not yet superseded
- simplified docs created but pending approval
- coding paused unless human explicitly says otherwise
- board tasks preserved
- blockers and unresolved questions

### Step 5 - Draft `docs/07-decision-log.md`
Include a proposed decision entry:

```md
### DEC-XXX: Migrate from expanded framework docs to simplified structure
- Date:
- Status: Proposed
- Decision area: Framework / Delivery
- Related docs:
- Context: Existing project used expanded docs and is being migrated to simplified docs plus board plan.
- Final decision: Proposed migration to simplified docs `00`-`07` while preserving old docs as references until activation.
- Why:
- Consequences:
- Follow-up actions:
- Revisit trigger:
```

Do not mark the decision `Accepted` until human approval.

### Step 6 - Analyze Board Without Clearing It
Inspect `project/index.html` and report:
- task count before migration
- assumptions count before migration
- task types in use
- tasks missing EPIC > wave > task hierarchy
- ready tasks missing subagent task contract
- ready tasks missing integration contract
- ready tasks missing quality gate
- tasks linking to old docs
- dependencies pointing to missing tasks
- validation/launch coverage gaps

Do not delete tasks.
Do not clear the board.
Do not mass-edit task statuses unless needed to prevent unsafe coding; if changed, document every status change.

### Step 7 - Produce `docs/MIGRATION-REPORT.md`
Create a report with these sections:

```md
# Migration Report

## Summary
- Migration phase:
- Old docs found:
- New docs drafted:
- Board task count before:
- Board task count after:
- Main risks:

## Old-To-New Mapping
| Old source | New destination | Status | Notes |
|---|---|---|---|

## Preserved Quality Gates
- ...

## Not Applicable Areas
- Area:
  - Why not applicable:

## Conflicts Or Ambiguities
- Conflict:
  - Sources:
  - Impact:
  - Required human decision:

## Board Migration Findings
- Tasks needing doc-link updates:
- Tasks missing hierarchy:
- Tasks missing contracts:
- Tasks missing validation:
- Dependency issues:

## Recommended Activation Steps
1.
2.
3.

## Stop-And-Ask Items
- Item:
  - Why human review is needed:
```

### Pass 1 Acceptance Criteria
Pass 1 is complete only when:
- simplified docs `00`-`07` exist
- old docs still exist and are not marked superseded by this pass
- `AGENTS.md` has not been switched to simplified read order unless already approved before migration
- existing board tasks are preserved
- `docs/MIGRATION-REPORT.md` exists
- `docs/06-current-state.md` says migration is in review
- `docs/07-decision-log.md` contains a proposed migration decision
- coverage checklist is complete or gaps are documented

## Human Review Checkpoint
After Pass 1, stop and ask the human to approve activation.

The human should review:
- simplified docs
- migration report
- conflicts/ambiguities
- board migration findings
- recommended activation steps
- whether old docs should be marked superseded
- whether `AGENTS.md` should switch to the simplified read order

Do not proceed to Pass 2 without human approval.

## Pass 2 - Activation

### Goal
Activate the simplified framework structure after human approval.

### Step 1 - Update `AGENTS.md`
Switch read-first rules to:

```text
Always read:
1. docs/00-app-definition.md
2. docs/06-current-state.md
3. docs/07-decision-log.md
4. project/index.html

Read additionally:
- Product/UX -> docs/01-product-and-ux.md
- System/data/integrations/API -> docs/02-system-design.md
- Security/privacy/permissions -> docs/03-safety-and-permissions.md
- Quality/release/tests -> docs/04-quality-and-release.md
- Workflow/orchestration/task contracts -> docs/05-agent-workflow.md
```

Keep the coding permission rule strict:
- source docs ready
- board plan human-approved
- target task ready
- valid EPIC > wave > task hierarchy
- complete subagent task contract
- complete integration contract
- no blocking decision/assumption

### Step 2 - Update `docs/DOCS-INDEX.md`
Make the simplified docs the active docs.

Document old expanded docs as superseded reference only.

### Step 3 - Update Board Source Links
For existing board tasks:
- update old doc links to new doc links where mapping is clear
- preserve task IDs and dependencies
- preserve task status unless unsafe
- move tasks to `review` if their source context, hierarchy, contract, or validation became incomplete
- do not delete tasks

### Step 4 - Mark And Separate Old Docs
Move old expanded docs out of the active docs surface, preferably into `docs/legacy-expanded-framework/`, then add this notice to each old expanded doc that was replaced:

```md
> Superseded framework reference.
>
> Status: Superseded
> Replaced By: `<new-doc-path>`
> Use the replacement doc as active source truth. Keep this file for migration/audit/reference only unless the human explicitly asks to analyze the old framework.
```

Do not delete old docs. Keep them in `docs/legacy-expanded-framework/` or another clearly named legacy/archive folder.

### Step 5 - Accept Decision Log Entry
Update the migration decision in `docs/07-decision-log.md` from `Proposed` to `Accepted` if human approved.

### Step 6 - Update Current State
Update `docs/06-current-state.md` to show:
- migration activated
- simplified docs active
- old docs superseded
- board migration status
- remaining task contract gaps
- whether implementation may resume

### Step 7 - Validate Activation
Run or manually perform these checks:

- simplified docs `00`-`07` exist
- `AGENTS.md` points to simplified docs
- `docs/DOCS-INDEX.md` points to simplified docs
- old docs still exist
- old docs have superseded notices
- board JSON parses
- board task count did not unexpectedly decrease
- no board dependency points to a missing task
- ready tasks have valid hierarchy and contracts
- current state reflects activation
- decision log records accepted migration decision

### Pass 2 Acceptance Criteria
Pass 2 is complete only when:
- human approval is recorded
- simplified docs are active
- old docs are superseded but retained
- `AGENTS.md` uses simplified read order
- board tasks are preserved
- unsafe/incomplete tasks are moved to `review` or `blocked`
- validation checks pass
- final report lists changed files, risks, and follow-up items

## Board Task Safety Rules
During migration, board tasks must be treated carefully.

Do not:
- clear the board
- delete tasks
- renumber task IDs
- remove dependencies without explanation
- mark tasks ready because docs were migrated
- remove validation tasks
- remove assumptions or blockers without human approval

Do:
- preserve existing task IDs
- preserve dependencies
- update doc links only when mapping is clear
- add migration notes where useful
- flag incomplete contracts
- move unsafe ready tasks to `review` if needed
- document all status changes in the migration report

## Stop Conditions
Stop and ask the human if:
- old docs conflict materially
- a required quality gate has no destination
- board tasks depend on old docs in a way that cannot be mapped
- app scope appears to change during migration
- security/privacy/permissions become ambiguous
- release or validation requirements are unclear
- you would need to delete, rename, or overwrite old docs
- you would need to clear or heavily rewrite the board
- activation approval has not been provided

## Final Output Format For AI Agent
At the end of each pass, report:

- what changed
- why it changed
- files affected
- board task count before/after
- tests/checks run
- source-truth or quality-gate gaps
- board tasks needing human review
- risks/follow-up items
- whether human approval is required before next step

## Quick Command Checklist
Use these commands when available and appropriate:

```bash
# Count docs
find docs -maxdepth 1 -type f -name '*.md' | sort

# Find old doc references
rg "00-project-charter|01-scope-and-mode|02-product-requirements|13-current-state|14-decision-log" docs AGENTS.md project/index.html

# Validate board JSON when board is single-file HTML
python3 - <<'PY'
from pathlib import Path
import json, re
s = Path('project/index.html').read_text()
m = re.search(r'<script id="board-data" type="application/json">(.*?)</script>', s, re.S)
json.loads(m.group(1))
print('board JSON ok')
PY
```

If the project uses a different board storage format, validate that format instead.

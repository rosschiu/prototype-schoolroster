# Current State

- Human Action: NO
- Status: Active
- Owner: AI-maintained, human-corrected when needed
- Inputs: Repo state, active board plan, `docs/00-app-definition.md`, and recent decisions from `docs/07-decision-log.md`
- Owns: Latest truthful snapshot of implementation status, readiness, blockers, current priorities, known gaps, and immediate next steps
- Must Not Repeat: Full requirements, UX rationale, architecture theory, or long decision history
- Update Trigger: After meaningful implementation change, scope change, important bug discovery, major decision, or readiness change
- Mode Applicability: Any once work has started

## Purpose
Provide the fastest possible operational snapshot for humans and agents.

## Current Snapshot [AIH]
- Current milestone or phase: Phase 1 (Define) — source docs drafted for Steck Teacher Rostering Module
- Delivery mode: MVP
- Current top priority: Human review of drafted source docs, then board compilation and approval
- Current top risk: Steck merge path complexity; algorithm correctness and explainability
- Current blocker if any: Source docs are draft and require human review before board compilation

## Workflow Readiness [AIH]
- App definition (`00`): DRAFT — populated for Teacher Rostering Module
- Product and UX (`01`): DRAFT — populated for Teacher Rostering Module
- System design (`02`): DRAFT — populated for Teacher Rostering Module
- Safety and permissions (`03`): DRAFT — populated for Teacher Rostering Module
- Quality and release (`04`): DRAFT — populated for Teacher Rostering Module
- Agent workflow (`05`): TEMPLATE — framework doc, not project-specific
- Board plan (`project/index.html`): BLANK TEMPLATE — needs compilation after doc approval

Readiness meaning:
- `NOT READY` - do not use for implementation
- `REVIEW` - draft exists, but human confirmation is still needed
- `READY` - safe to use as current truth for implementation
- `BLANK TEMPLATE` - ready to be populated for a target project, not for framework-internal tracking

## Current Coding Blockers [AIH]
- Blocking human decision: Source docs need human review and approval.
- Missing or not-ready source doc: All source docs are draft status.
- Task-board issue preventing implementation: Board not yet compiled.

Coding may start only when:
- source docs required by scope are `READY`
- compiled board plan is human-approved
- target task is `ready`
- target task has valid EPIC > wave > task hierarchy
- target task has complete subagent and integration contracts
- no blocking human decision or assumption applies

## What Is Done [AIH]
- Capability: App definition drafted (`docs/00-app-definition.md`).
- Capability: Product and UX drafted (`docs/01-product-and-ux.md`).
- Capability: System design drafted (`docs/02-system-design.md`).
- Capability: Safety and permissions drafted (`docs/03-safety-and-permissions.md`).
- Capability: Quality and release drafted (`docs/04-quality-and-release.md`).
- Capability: Steck codebase explored and architecture understood.

## What Is In Progress [AIH]
- Item: Human review of source docs
  - Status: Waiting for human feedback on drafted docs.
  - Risk or blocker: None yet; docs are fresh and need validation.

## What Is Next [AIH]
1. Human reviews and approves (or requests changes to) the drafted source docs.
2. Compile board plan into `project/index.html` using `docs/10-board-compiler-runbook.md`.
3. Add EPIC > wave > task hierarchy for the rostering module.
4. Human approves the compiled board plan.
5. Begin implementation waves using `docs/11-execution-runbook.md`.

## Known Gaps and Bugs [AIH]
- Gap: Board plan not yet compiled.
- Gap: Steck merge path is conceptual; concrete file mapping and migration plan need to be created as tasks.
- Gap: Algorithm test fixtures and example data not yet created.

## Recent Important Changes [AIH]
- Date: 2026-04-26
- Change: Drafted all five source docs for the Steck Teacher Rostering Module.
- Why it mattered: Established the product, technical, security, and quality foundation for the module.

## Notes for New Contributors or Agents [AIH]
- Start here: Read `AGENTS.md`, `docs/00-app-definition.md`, this file, `docs/07-decision-log.md`, then inspect `project/index.html`.
- This is a module for Steck: `~/steck` contains the target monorepo. This repo is for separate MVP development.
- Before coding: confirm source readiness, board approval, task contracts, and blockers first.

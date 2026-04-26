# Decision Log

- Human Action: NO
- Status: Active
- Owner: AI-maintained, human-approved for important decisions
- Inputs: Approved project/framework decisions, code changes, board updates, and current state
- Owns: Durable record of important decisions, rationale, consequences, follow-up actions, and revisit triggers
- Must Not Repeat: Current status tracking, full implementation detail, or broad narrative already covered elsewhere
- Update Trigger: Any decision that changes direction, constraints, architecture, UX, security posture, delivery expectations, or framework behavior
- Mode Applicability: Any once non-trivial decisions exist

## Purpose
Record durable decisions so humans and agents do not re-litigate settled choices.

## Entry Template [AIH]

### DEC-000: <Decision Title>
- Date:
- Status: Proposed / Accepted / Superseded / Rejected
- Decision area: Product / UX / Architecture / Security / Delivery / Framework / Other
- Related docs:
- Context:
- Options considered:
  - Option A:
  - Option B:
  - Option C:
- Final decision:
- Why:
- Consequences:
- Follow-up actions:
- Revisit trigger:

## Decision Entries [AIH]

### DEC-001: Use simplified docs plus board as the framework baseline
- Date: 2026-04-26
- Status: Accepted
- Decision area: Framework / Delivery
- Related docs: `AGENTS.md`, `docs/00-app-definition.md`, `docs/05-agent-workflow.md`, `project/index.html`
- Context: The expanded 20+ doc framework preserved rigor but created too much navigation and review overhead for reusable project generation.
- Options considered:
  - Option A: Keep the expanded framework as the active baseline.
  - Option B: Consolidate into fewer stronger docs and keep the board as the compiled project plan.
  - Option C: Remove docs and rely mostly on the board.
- Final decision: Use Option B.
- Why: Fewer docs reduce human/agent overhead while preserving quality gates through consolidated sections and stricter board contracts.
- Consequences: `AGENTS.md` and `DOCS-INDEX.md` now point to simplified docs; expanded docs are retained as superseded reference.
- Follow-up actions: Review the simplified docs before propagating to new/existing projects.
- Revisit trigger: Simplified docs miss an important quality gate or are too dense for human review.

### DEC-002: Keep the project board blank in the framework source
- Date: 2026-04-26
- Status: Accepted
- Decision area: Framework / Delivery
- Related docs: `project/index.html`, `docs/06-current-state.md`
- Context: The board is intended for target projects, not for tracking work on the framework source itself.
- Options considered:
  - Option A: Continue using the board to track framework changes.
  - Option B: Clear the board and keep it as a reusable template for target projects.
  - Option C: Maintain separate framework and project boards in the same file.
- Final decision: Use Option B.
- Why: A blank template avoids leaking framework-internal tasks into new projects.
- Consequences: Framework work should be tracked outside the reusable board or in a separate non-template surface if needed.
- Follow-up actions: Keep `project/index.html` empty except for schema/example guidance needed by target projects.
- Revisit trigger: Framework development needs its own dedicated board template separate from target project board.

### DEC-003: Preserve expanded docs as superseded migration references
- Date: 2026-04-26
- Status: Accepted
- Decision area: Framework / Migration
- Related docs: `docs/legacy-expanded-framework/`
- Context: Existing projects or future analysis may need the detailed expanded docs even though the active baseline is simplified.
- Options considered:
  - Option A: Delete expanded docs immediately.
  - Option B: Keep expanded docs and mark them superseded with replacement pointers.
  - Option C: Keep both expanded and simplified docs active.
- Final decision: Use Option B and keep the files in `docs/legacy-expanded-framework/`.
- Why: It preserves audit/migration value without allowing multiple active sources of truth in the active docs folder.
- Consequences: Agents must follow simplified docs as active truth and treat expanded docs as reference only.
- Follow-up actions: Keep the legacy folder clearly separated from active docs; consider deleting only with explicit human approval.
- Revisit trigger: Superseded docs create confusion or existing project migration requires a different archive structure.


### DEC-004: Add procedural runbooks for weak-agent execution
- Date: 2026-04-26
- Status: Accepted
- Decision area: Framework / Delivery
- Related docs: `docs/09-human-interview-guide.md`, `docs/10-board-compiler-runbook.md`, `docs/11-execution-runbook.md`, `docs/12-coverage-and-success-gates.md`, `project/index.html`
- Context: The simplified framework was structurally clean, but weaker agents and primitive harnesses need explicit procedural guidance to interview layman humans, compile complete boards, execute tasks, and validate success.
- Options considered:
  - Option A: Keep only consolidated source docs and rely on agent reasoning.
  - Option B: Add procedural runbooks for human interviewing, board compilation, execution, and coverage/success gates.
  - Option C: Re-expand into many detailed source docs.
- Final decision: Use Option B.
- Why: It preserves the simplified source-doc structure while giving weaker agents deterministic checklists and stop conditions.
- Consequences: Active framework now has source docs `00`-`04`, workflow/state docs `05`-`08`, and procedural runbooks `09`-`12`.
- Follow-up actions: Keep board validators aligned with the runbooks as the schema evolves.
- Revisit trigger: Weak agents still fail to collect enough detail, compile complete boards, or complete launch validation.

### DEC-005: Build Teacher Rostering as a separate MVP module for later Steck merge
- Date: 2026-04-26
- Status: Accepted
- Decision area: Product / Architecture / Delivery
- Related docs: `docs/00-app-definition.md`, `docs/02-system-design.md`
- Context: The human wants a new teacher rostering module (schedule planning, leave, substitute teacher matching) for Steck, but wants to develop it separately and merge back after MVP.
- Options considered:
  - Option A: Build directly in the Steck monorepo now.
  - Option B: Build in a separate repo/module and merge back later.
  - Option C: Build as a standalone microservice.
- Final decision: Use Option B.
- Why: Allows focused MVP development without destabilizing Steck's current state; merge path is cleaner once the module is proven. Avoids premature microservices.
- Consequences: This repo becomes the temporary home for the rostering module. Must maintain Steck architecture compatibility throughout.
- Follow-up actions: Create concrete Steck merge plan as a board task; ensure all code follows Steck conventions.
- Revisit trigger: Merge becomes too difficult due to architectural drift.

### DEC-006: Substitute teacher matching uses weighted multi-criteria scoring
- Date: 2026-04-26
- Status: Accepted
- Decision area: Product / Architecture
- Related docs: `docs/01-product-and-ux.md`, `docs/02-system-design.md`
- Context: The human specified four criteria for choosing a substitute teacher: (1) workload balance, (2) subject expertise, (3) class familiarity, (4) configurable school-specific rules.
- Options considered:
  - Option A: Simple rule-based filtering (e.g., only show teachers with competency).
  - Option B: Weighted scoring algorithm with explainable breakdown.
  - Option C: Machine learning model for matching.
- Final decision: Use Option B.
- Why: Explainable, testable, configurable per school, and fast enough for MVP scale. ML is overkill and not explainable enough for school admins.
- Consequences: Need `substitute_rule_config` table; algorithm must return score breakdown for each candidate.
- Follow-up actions: Document exact scoring formula; create unit tests for all criteria combinations.
- Revisit trigger: School needs more complex rule logic (e.g., exclusion rules, soft constraints) that weights cannot express.

### DEC-007: Full-day leave only for MVP; session-level leave deferred
- Date: 2026-04-26
- Status: Accepted
- Decision area: Product / Delivery
- Related docs: `docs/01-product-and-ux.md`, `docs/00-app-definition.md`
- Context: The human described leave application but did not specify granularity. Session-level leave is more complex (affects only some periods of a day).
- Options considered:
  - Option A: Support session-level leave from day one.
  - Option B: Support full-day leave only for MVP; session-level later.
  - Option C: Support both from day one.
- Final decision: Use Option B.
- Why: Most school leave (sick days, personal days) is full-day. Session-level adds UI and algorithm complexity that can be added later without breaking full-day data.
- Consequences: Simpler leave model and substitute assignment. Teachers cannot apply for half-day leave in MVP.
- Follow-up actions: Design database schema to allow future session-level leave without migration pain.
- Revisit trigger: Pilot school requires half-day or partial leave support.

### DEC-008: Formal algorithm specification for substitute matching
- Date: 2026-04-26
- Status: Accepted
- Decision area: Architecture / Product
- Related docs: `docs/02-system-design.md` (Substitute Matching Algorithm Specification)
- Context: The human identified that substitute teacher assignment is not a simple CRUD problem and requested research and formalization. Research confirmed it is a multi-criteria optimization problem (analogous to nurse scheduling / CSP).
- Options considered:
  - Option A: Simple rule-based filtering only (e.g., show teachers with competency, let admin pick).
  - Option B: Weighted multi-criteria scoring with formal formulas, normalization, fairness metrics, and explainability contract.
  - Option C: Machine learning model for matching.
  - Option D: Integer Linear Programming / CP-SAT solver (Google OR-Tools) for global optimization.
- Final decision: Use Option B for MVP, with a documented migration path to Option D if auto-assignment or global optimization becomes a requirement.
- Why:
  - Option B is explainable, testable, configurable per school, and fast (<500ms per leave at MVP scale).
  - Option A would fail fairness requirements and produce untrustworthy recommendations.
  - Option C is overkill, opaque, and lacks educational explainability requirements.
  - Option D is powerful but introduces a heavy dependency and is unnecessary when the human remains in the loop (admin override).
- Consequences:
  - The system design doc now contains a complete algorithm specification with exact scoring formulas, normalization strategy, configuration model, fairness metrics, and API explainability contract.
  - The scoring engine must be implemented as a standalone, heavily unit-tested module.
  - The data model supports all required inputs (competency, familiarity, workload history, rule configs).
  - A future spike can migrate to CP-SAT without changing the data model or scoring semantics.
- Follow-up actions:
  - Create board tasks for scoring engine implementation and unit tests.
  - Create test fixtures with known expected rankings to validate the algorithm.
  - Document the CP-SAT migration path in the technical backlog.
- Revisit trigger:
  - School requires automatic assignment without human approval per session.
  - Fairness metrics consistently fall below TFI ≥ 0.80 with weighted scoring.
  - Scale grows beyond ~200 teachers or ~3000 sessions/week where O(n log n) ranking becomes a bottleneck.

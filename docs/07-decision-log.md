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
- Status: Superseded by DEC-009
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

### DEC-009: MVP supports AM/PM half-day leave and admin impact correction
- Date: 2026-04-27
- Status: Accepted
- Decision area: Product / UX / Architecture
- Related docs: `docs/00-app-definition.md`, `docs/01-product-and-ux.md`, `docs/02-system-design.md`
- Context: Human clarified that full-day-only leave was an overlooked constraint and real schools need partial-day leave at least down to AM/PM half-day.
- Options considered:
  - Option A: Keep full-day-only leave for MVP.
  - Option B: Support full-day plus AM/PM half-day leave for MVP.
  - Option C: Support arbitrary teacher-selected session-level leave for MVP.
- Final decision: Use Option B.
- Why: It covers common real school workflows without requiring a complex arbitrary period picker for teachers. The system still computes session-level impacts internally and allows audited admin correction.
- Consequences:
  - `leave_requests` includes `duration_type`.
  - `leave_session_impacts` remains the coverage source of truth.
  - Timetable configuration must support AM/PM period grouping or boundary time.
  - Board and validation tasks must cover full-day, AM half-day, PM half-day, and admin impact correction.
- Follow-up actions: Keep arbitrary session-level leave as future scope unless pilot schools require it.
- Revisit trigger: Schools need teacher-facing arbitrary period-by-period leave requests.

### DEC-010: Substitute recommendation SLA favors quality with visible run status
- Date: 2026-04-27
- Status: Accepted
- Decision area: Product / UX / Architecture
- Related docs: `docs/00-app-definition.md`, `docs/01-product-and-ux.md`, `docs/02-system-design.md`, `docs/04-quality-and-release.md`
- Context: Human clarified that substitute recommendations do not need a strict 2-second response if the algorithm is good and the UI provides proper run status while calculating.
- Options considered:
  - Option A: Require all recommendations under 2 seconds.
  - Option B: Allow up to 2 minutes with clear run status, progress, retry, and manual fallback.
  - Option C: Run recommendations fully offline/asynchronously only.
- Final decision: Use Option B.
- Why: It avoids weakening algorithm quality for an arbitrary speed target while preserving admin trust through visible progress and fallback actions.
- Consequences:
  - Recommendation API may return synchronously for fast cases or return a job id for polling.
  - UI needs a recommendation run-status state.
  - Performance validation must check both typical latency and long-running status UX.
- Follow-up actions: Update board tasks for recommendation job/status API and UI.
- Revisit trigger: Pilot admins find recommendation wait time disruptive or data scale requires background job infrastructure.

### DEC-011: Standalone MVP first, Steck integration near app readiness
- Date: 2026-04-27
- Status: Accepted
- Decision area: Architecture / Delivery
- Related docs: `docs/00-app-definition.md`, `docs/02-system-design.md`, `docs/03-safety-and-permissions.md`, `docs/04-quality-and-release.md`
- Context: Human clarified that the module should be built standalone first and integrated with Steck only toward app readiness.
- Options considered:
  - Option A: Integrate Steck auth/session/notifications/calendar/resources immediately.
  - Option B: Build standalone MVP services first, preserve merge-compatible interfaces, integrate Steck near readiness.
- Final decision: Use Option B.
- Why: Reduces early dependency on unknown Steck service shapes and lets browser testing start sooner.
- Consequences:
  - MVP includes standalone auth/users/roles/school tenancy.
  - Notifications are mock/local for now.
  - Calendar/resource/equipment data is owned locally in this module.
  - Steck integration remains a later board/merge-readiness task.
- Follow-up actions: Update board tasks and assumptions for standalone auth, mock notifications, and local calendar/resource data.
- Revisit trigger: Steck integration contracts become available early and are low-risk to wire.

### DEC-012: MVP includes substitute accept/decline, teacher self-service availability, and rich preference rules
- Date: 2026-04-27
- Status: Accepted
- Decision area: Product / UX / Architecture
- Related docs: `docs/01-product-and-ux.md`, `docs/02-system-design.md`, `docs/03-safety-and-permissions.md`
- Context: Human clarified remaining product decisions for substitute workflow and rule depth.
- Options considered:
  - Substitute flow: admin-confirmed only vs accept/decline.
  - Availability ownership: admin-managed only vs teacher self-service.
  - Preference rules: simple hard exclusions/preferred boost vs richer scoped rules.
- Final decision: Include accept/decline, teacher self-service availability, and richer scoped preference/exclusion rules in MVP.
- Why: These match real school operations and improve trust in substitution workflows.
- Consequences:
  - Assignment lifecycle includes offered, accepted, declined, canceled, completed, and unfilled states.
  - Teachers manage their own availability.
  - Rule model supports class, original teacher, subject/grade, subject, teacher, and school-wide scopes.
- Follow-up actions: Update board tasks/contracts and validation coverage.
- Revisit trigger: Scope pressure requires a human-approved MVP cut.

### DEC-013: Approve compiled board plan for implementation
- Date: 2026-04-27
- Status: Accepted
- Decision area: Delivery
- Related docs: `project/index.html`, `docs/06-current-state.md`, `docs/10-board-compiler-runbook.md`, `docs/12-coverage-and-success-gates.md`
- Context: Source docs `00`-`04` were ready enough for planning, the compiled board had complete contracts, and the human explicitly approved the board.
- Options considered:
  - Option A: Keep board in review and continue planning.
  - Option B: Approve the compiled board and open the first safe foundation execution slice.
- Final decision: Use Option B.
- Why: The board now has valid hierarchy, coverage, contracts, and readiness metadata, so implementation can begin on dependency-safe foundation tasks.
- Consequences: `TASK-057` and `TASK-001` are marked ready; all other items remain draft until dependencies and wave sequence are satisfied.
- Follow-up actions: Implement ready tasks, run their quality gates, then open the next WAVE-001 tasks only when safe.
- Revisit trigger: Implementation discovers material mismatch between board contracts and repo reality.

### DEC-014: Real PostgreSQL persistence must follow Steck schema authority
- Date: 2026-04-27
- Status: Accepted
- Decision area: Architecture / Delivery / Data
- Related docs: `docs/00-app-definition.md`, `docs/02-system-design.md`, `docs/06-current-state.md`, `project/index.html`
- Context: Human clarified that the app must be backend-backed with real PostgreSQL, not merely API-backed/in-memory, and that any table/entity already existing in Steck must strictly follow Steck's DB schema for a seamless future merge.
- Options considered:
  - Option A: Continue with prototype-only `roster_*` identity/term/session tables and in-memory repositories for browser iteration.
  - Option B: Keep standalone runtime services but persist through Steck-compatible core tables plus new module-owned `rostering_*` tables.
  - Option C: Move implementation directly into the Steck monorepo now.
- Final decision: Use Option B.
- Why: It preserves standalone development speed while removing the major merge risk: incompatible persisted data shape. It also satisfies the MVP requirement that in-scope flows use durable PostgreSQL.
- Consequences:
  - Runtime repositories for schedules, leave, resources/calendar, notifications, and audit must be PostgreSQL-backed before further validation counts as MVP evidence.
  - Prototype duplicate tables such as `roster_schools`, `roster_users`, `roster_user_roles`, `roster_auth_sessions`, and `roster_terms` must be replaced or superseded.
  - Existing Steck tables (`schools`, `auth_users`, `school_memberships`, `role_assignments`, `auth_sessions`, `teachers`, `terms`, `grade_levels`, `subjects`, `audit_events`, `notification_events`, `notifications`) are authoritative and reused as-is.
  - Recurring roster slots must use a new module-owned table such as `rostering_schedule_sessions`; Steck's existing dated `class_sessions` table must not be overloaded.
  - `VAL-004` and `VAL-011` are blocked as final validation until persistence/restart checks pass against PostgreSQL.
- Follow-up actions: Add a board wave for PostgreSQL/Steck schema alignment and implement it before continuing feature validation.
- Revisit trigger: Steck main schema changes materially before merge, or human decides to build directly inside the Steck monorepo.

### DEC-015: API runtime requires PostgreSQL unless explicitly opted into local in-memory mode
- Date: 2026-04-27
- Status: Accepted
- Decision area: Architecture / Delivery / Data
- Related docs: `docs/00-app-definition.md`, `docs/06-current-state.md`, `project/index.html`
- Context: The human clarified that the app must be real PostgreSQL-backed, not merely API-backed with in-memory runtime state. During `INTEGRATION-010`, the app still needed a safe local/test fallback for unit tests, but the default server runtime should not silently start in non-durable mode.
- Options considered:
  - Option A: Keep automatic in-memory fallback whenever `DATABASE_URL` is absent.
  - Option B: Fail server startup without `DATABASE_URL`, with an explicit `ALLOW_IN_MEMORY_ROSTER_API=true` escape hatch for local/test-only fallback.
  - Option C: Remove in-memory repositories completely.
- Final decision: Use Option B.
- Why: It prevents accidental non-durable MVP/browser validation while preserving fast no-DB unit tests and developer fallback.
- Consequences:
  - `apps/api/src/server.ts` fails clearly if `DATABASE_URL` is absent and `ALLOW_IN_MEMORY_ROSTER_API` is not set.
  - Default service composition remains testable without DB, but production-like server startup is PostgreSQL-first.
  - Browser schedule and leave flows use backend routes and are expected to persist through PostgreSQL in validation.
- Follow-up actions: `VAL-018` should use a real `DATABASE_URL` and record schema/restart evidence before unblocking leave validations.
- Revisit trigger: Steck merge supplies a different runtime configuration pattern or test harness that replaces the local fallback.

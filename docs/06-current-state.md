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
- Current milestone or phase: Phase 3 (Build) — WAVE-008 Steck integration and merge planning
- Delivery mode: MVP
- Current top priority: Confirm/open WAVE-008 Steck integration and merge tasks (`TASK-039` through `TASK-044`) or decide whether to run launch/security validations first.
- Current top risk: Local development now depends on the existing Docker Postgres 18 container `pglocal`; agents should verify it is running before browser/API validation
- Current blocker if any: WAVE-008 tasks remain draft and need human confirmation before implementation that touches Steck merge/integration boundaries.

## Workflow Readiness [AIH]
- App definition (`00`): READY — human approved with full-day + AM/PM half-day leave and updated recommendation SLA
- Product and UX (`01`): READY — human approved with schedule defaults/admin overview and generated schedule projections
- System design (`02`): READY — human accepted as-is for planning; algorithm remains subject to review during browser/testing feedback
- Safety and permissions (`03`): READY — human approved enough for board cleanup
- Quality and release (`04`): READY — human approved with updated recommendation status/performance expectations
- Agent workflow (`05`): TEMPLATE — framework doc, not project-specific
- Board plan (`project/index.html`): APPROVED with amendment — compiled plan now includes a blocking PostgreSQL/Steck schema alignment wave before WAVE-004 validations can be treated as valid launch evidence

Readiness meaning:
- `NOT READY` - do not use for implementation
- `REVIEW` - draft exists, but human confirmation is still needed
- `READY` - safe to use as current truth for implementation
- `BLANK TEMPLATE` - ready to be populated for a target project, not for framework-internal tracking
- `DRAFT` - populated but not approved or complete enough for implementation

## Current Coding Blockers [AIH]
- Blocking human decision: None; human approved updating docs/board for real PostgreSQL and strict Steck schema compatibility.
- Missing or not-ready source doc: None for source docs `00`-`04`; source docs are approved enough for implementation.
- Task-board issue preventing implementation: WAVE-007 is complete; WAVE-008 Steck integration items are still draft, so implementation should pause at planning/review unless the human opens those tasks.

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
- Capability: Initial board plan drafted in `project/index.html` with EPIC > wave > task/integration/validation hierarchy and coverage mappings.
- Capability: Steck codebase explored and architecture understood.
- Capability: Formal substitute matching algorithm specification added to system design doc (3-phase pipeline: feasibility filter → multi-criteria scoring → ranking + explainability).
- Capability: WAVE-003 leave backend is integrated through routes, services, duration-aware impact calculation, audited admin impact adjustment, and reject/cancel impact closure.
- Capability: Teacher leave application/status UI, admin leave queue/impact correction UI, local/mock leave notification flow, admin-created leave records, leave end-to-end convergence, and real leave UI-to-API wiring are implemented and covered by browser/API tests.
- Capability: Browser schedule and leave flows now have real API clients for backend timetable/session/publish/leave routes; the running API requires `DATABASE_URL` unless explicitly opted into in-memory fallback for local/test use.
- Capability: `TASK-061` PostgreSQL migration/config foundation is complete: API config, `pg` helper, schema-safe table refs, Steck-compatible core baseline, `rostering_*` module migrations, server migration hook when `DATABASE_URL` is set, and schema compatibility tests.
- Capability: `TASK-062` PostgreSQL auth and tenant adapter is complete: standalone auth can persist users, memberships, roles, teacher actor IDs, sessions, CSRF hashes, role switching, and sign-out through Steck-compatible tables when `DATABASE_URL` is configured.
- Capability: `TASK-063` PostgreSQL timetable, schedule, resource, and calendar repositories are complete: timetable, period, schedule-session, room, equipment-resource, schedule-equipment, and calendar exception data can persist through `rostering_*` tables when `DATABASE_URL` is configured.
- Capability: `TASK-064` PostgreSQL leave, impact, audit, and notification repositories are complete: leave requests, session impacts, audit events, notification events, notification rows, and mock email delivery records can persist through Steck-compatible PostgreSQL tables when `DATABASE_URL` is configured.
- Capability: `INTEGRATION-010` runtime convergence is complete: default services use PostgreSQL repositories when configured, frontend schedule/leave clients call backend routes, publish/unpublish updates session exposure state, and restart smoke evidence proves a timetable/session/leave/impact survived API restart.
- Capability: `VAL-018` PostgreSQL persistence and Steck schema compatibility validation is complete against existing Docker Postgres 18 `pglocal` (`postgres://nexus:***@127.0.0.1:5432/nexus2`, schema `schoolroster_val18`), with evidence in `output/val-018-pglocal-evidence.json`.
- Capability: `VAL-004` and `VAL-011` persistence-backed leave validations are complete against the Postgres 18 `pglocal` browser/API runtime, with evidence in `output/val-004-011-browser-evidence.json` and screenshots in `output/playwright/`.
- Capability: `TASK-019`, `TASK-022`, `TASK-023`, and `TASK-024` are complete: substitute rule config, teacher competency, and class familiarity tables are in the PostgreSQL migration metadata; default rule configs are seeded; workload balance, subject competency, and class familiarity scorer modules are implemented with deterministic tests matching `docs/02-system-design.md`.
- Capability: `TASK-025` weighted composite scoring and ranking is complete: enabled weights normalize at runtime, recency and preference/policy scoring are implemented, infeasible and hard-excluded candidates are filtered, explainability breakdowns/raw inputs are emitted, and deterministic tie-break/performance tests pass.
- Capability: `TASK-026` substitute recommendation API is complete: `/api/roster/substitutes/recommend` returns ranked explainable candidates from the composite scorer, `/api/roster/substitutes/recommendations/:job_id` exposes polling, and route tests cover sync result, async-style polling, admin-only access, validation errors, and pglocal PostgreSQL execution.
- Capability: `TASK-049` teacher availability and hard eligibility support is complete: PostgreSQL migrations now include substitute availability and assignment tables; `/api/roster/availability` supports scoped GET/PATCH; recommendations filter original teacher, same-period conflicts, approved leave, unavailable date/period overrides, optional competency requirements, configured exclusions, and weekly-cap assignment counts before scoring.
- Capability: `TASK-056` durable/idempotent recommendation job status service is complete: PostgreSQL/in-memory job repositories store deterministic recommendation jobs, async-style requests return a running snapshot while polling returns the completed cached result, completed retries reuse the same job id, and job polling is school-scoped.
- Capability: `TASK-058` teacher self-service availability UI is complete: teachers can save full-day, AM/PM half-day, and single-period availability overrides through API-025 from the browser; frontend tests cover self-only payloads, half-day period expansion, refresh, and override list states.
- Capability: `TASK-020` rule-config service and admin UI is complete: `/api/roster/rules` supports admin-scoped GET/PATCH with validation/audit, rule weights feed recommendation scoring, and the browser exposes scoring weights, enabled criteria, weekly cap, and hard competency controls.
- Capability: `INTEGRATION-005` rule-config convergence is complete: API integration coverage proves rule weight updates, teacher availability overrides, and substitute recommendations work together end-to-end; browser coverage proves rule and availability panels are reachable from the roster shell.
- Capability: `TASK-050` rich preference/exclusion rule management is complete: API-026 supports admin-scoped GET/PATCH for preferred, soft avoid, and hard exclusion rules across schedule-session, original-teacher, subject-grade, subject, teacher, and school scopes; mutations are audited; the browser exposes the admin preference panel; recommendations consume the strongest matching scope when calculating `score_E` or filtering hard exclusions.
- Capability: `INTEGRATION-006` algorithm convergence is complete: dedicated integration coverage now proves scorer weights, competency, familiarity, availability filtering, hard exclusions, preference boosts, explainability payloads, async recommendation job polling, and idempotent retry work together through API routes and service/data seams.
- Capability: WAVE-005 validations (`VAL-001`, `VAL-007`, `VAL-016`) are complete: algorithm correctness, recommendation performance/status smoke, and teacher availability impact on recommendations passed locally and against Postgres 18 `pglocal`, with evidence in `output/wave005-validation-evidence.json`.
- Capability: `TASK-027` substitute recommendation panel is complete: Leave Management now shows per-impact recommendation panels, calls the backend recommendation job API, displays run status/progress, supports retry plus manual/unfilled fallback controls, renders ranked candidates with reason codes, and lets admins select a candidate in the UI.
- Capability: `TASK-028` score breakdown/explainability UI is complete: each ranked recommendation can expand to show the composite score, criterion scores, weights, contributions, detail text, and raw workload/competency/recency inputs.
- Capability: `TASK-029` manual override search is complete: admins can search all teachers from the recommendation panel, see availability indicators, confirm a manual override, and get local audit-log evidence for the override selection.
- Capability: `TASK-030` substitute offer confirmation and notification is complete: admins can send an offer from the selected recommendation/manual override, the API persists an offered substitute assignment in PostgreSQL, updates impact coverage to assigned, writes audit, and emits mock/local substitute notification.
- Capability: `TASK-031` teacher substitute offers/assignments page is complete: teachers can list only their own offers, view assignment details, accept or decline offers, and those responses update assignment status, impact coverage, audit, and admin notifications.
- Capability: `TASK-047` unfilled coverage queue is complete: admins can open an API-backed queue of active unfilled leave impacts, filter by date and absent teacher, navigate back to the leave assignment flow, get retry guidance, and mark a gap as no-coverage-needed so it leaves the queue. The API is admin-only and backed by PostgreSQL validation through `pglocal`.
- Capability: `TASK-048` coverage lifecycle cancellation/reassignment service is complete: admins can cancel active substitute assignments with a reason, complete accepted/assigned assignments, and reassign coverage by canceling the previous assignment and creating a new offer; every mutation updates coverage status, preserves history, writes audit events, emits notifications, and passes local plus `pglocal` validation.
- Capability: `INTEGRATION-007` substitute assignment end-to-end convergence is complete: API integration coverage now proves recommendation job/status, explainability payload availability, offer creation, substitute teacher listing/acceptance, assignment completion, declined coverage returning to the unfilled queue, reassignment, cancellation, queue reappearance, and admin/teacher permission boundaries together in one flow.
- Capability: `VAL-005` browser validation is complete: Playwright browser automation against Vite + the pglocal API proved an admin can create/publish a timetable session, submit leave, view recommendations, select a substitute, send the offer, see assigned coverage status, and see `substitute.offered` in the notification log. Evidence is in `output/val-005-browser-evidence.json` and `output/playwright/val-005-admin-assigns-substitute.png`.
- Capability: `VAL-012` browser validation is complete: Playwright against Vite + pglocal API proved teacher accept/decline, admin completion, declined coverage entering the unfilled queue, reassignment, cancellation, and queue reappearance. Evidence is in `output/val-012-browser-evidence.json` and `output/playwright/val-012-coverage-lifecycle.png`.
- Capability: `TASK-033` roster audit query service is complete: admins can query Steck-compatible audit events through `/api/roster/audit` with school, actor, event, object, date, and limit filters; teachers are denied; in-memory and PostgreSQL-backed routes are covered, including `pglocal` validation.
- Capability: `TASK-034` audit write completeness is complete: class session create/update/delete now write audit events, and existing timetable publish, leave lifecycle, substitute lifecycle, rule config, preference, and availability mutations are covered by the shared audit/query path.
- Capability: `VAL-015` browser validation is complete: Playwright against Vite + pglocal API with delayed status polling proved recommendation running/progress UI, retry, manual assignment fallback, mark-unfilled fallback, and completed ranked candidates. Evidence is in `output/val-015-browser-evidence.json` and `output/playwright/val-015-recommendation-status.png`.
- Capability: WAVE-007 reports and export are complete: workload, leave summary, substitute history, and coverage operations reports are available through PostgreSQL-backed APIs and the browser Reports panel.
- Capability: CSV report export is complete: workload, leave summary, substitute history, and coverage operations export routes return CSV; browser downloads preserve the UTF-8 BOM for Excel compatibility, with evidence in `output/val-006-browser-evidence.json` and `output/val-006-workload.csv`.
- Capability: `VAL-013` coverage operations validation is complete: deterministic integration fixtures prove fill rate, required/unfilled impacts, cancellation count, reassignment count, and average time-to-fill calculations, including pglocal validation.

## What Is In Progress [AIH]
- Item: PostgreSQL and Steck schema alignment
  - Status: `TASK-061` through `TASK-064`, `INTEGRATION-010`, and `VAL-018` are done.
  - Risk or blocker: None for current leave validation; keep using `pglocal` for DB-backed validation unless a project-specific database replaces it.
- Item: WAVE-004 leave UI and notifications
  - Status: Teacher leave application, admin leave management, mock/local notification wiring, teacher leave status, admin-created leave records, leave end-to-end convergence, real UI-to-API wiring, and persistence-backed validations are done.
  - Risk or blocker: None for current scope.
- Item: WAVE-006 substitute assignment UI
  - Status: WAVE-006 is done; `TASK-027`, `TASK-028`, `TASK-029`, `TASK-030`, `TASK-031`, `TASK-047`, `TASK-048`, `INTEGRATION-007`, `VAL-005`, `VAL-012`, and `VAL-015` are done.
  - Risk or blocker: None for WAVE-006; next work is WAVE-007 once opened from draft.
- Item: WAVE-007 audit, reports, and export
  - Status: WAVE-007 is done; `TASK-033`, `TASK-034`, `TASK-035`, `TASK-036`, `TASK-037`, `TASK-038`, `TASK-051`, `INTEGRATION-008`, `VAL-006`, and `VAL-013` are done.
  - Risk or blocker: None for WAVE-007.

## What Is Next [AIH]
1. Confirm/open WAVE-008 Steck integration and merge tasks, starting with `TASK-039` shared contracts and `TASK-043` merge plan documentation.
2. Decide whether remaining validation items (`VAL-002`, `VAL-008`, `VAL-009`, `VAL-010`) should be opened before or after Steck merge adapter work.
3. Keep using `pglocal` for DB-backed validation unless a project-specific database replaces it.

## Known Gaps and Bugs [AIH]
- Gap: Later board items remain draft until dependencies and wave sequence are satisfied.
- Gap: Permanent/shared environment configuration is still not formalized; local validation currently uses existing Docker Postgres 18 `pglocal`.
- Gap: Steck merge path is conceptual; concrete file mapping and migration plan need to be created as tasks.
- Gap: Recommendation, leave, substitute assignment, audit, report, coverage operations, and CSV export flows now have API/component/pglocal coverage plus selected browser evidence; remaining gaps are launch/security/accessibility validation and Steck merge adapter work.
- Gap: Algorithm details may receive further human feedback during browser/testing review; current spec is accepted for planning.
- Gap: Human may still review/refine algorithm details during browser/testing feedback, but source docs are accepted for planning.

## Recent Important Changes [AIH]
- Date: 2026-04-26
- Change: Drafted all five source docs for the Steck Teacher Rostering Module.
- Why it mattered: Established the product, technical, security, and quality foundation for the module.
- Date: 2026-04-26
- Change: Added formal Substitute Matching Algorithm Specification to system design doc after web research confirmed this is a multi-criteria optimization problem (CSP / nurse scheduling analogue).
- Why it mattered: Prevents implementation of a naive CRUD substitute picker; establishes exact scoring formulas, normalization, fairness metrics (TFI), explainability contract, and a migration path to CP-SAT if needed.
- Date: 2026-04-26
- Change: Reconciled current state with the existing drafted board plan.
- Why it mattered: The repo no longer reports the board as blank; remaining blockers are now board approval and task-contract completion rather than initial compilation.
- Date: 2026-04-27
- Change: Added research-informed UX/user-flow and functional-requirement coverage cases to source docs.
- Why it mattered: Captures common absence/substitute-management edge cases before human review and board approval, reducing the chance of under-scoped MVP planning.
- Date: 2026-04-27
- Change: Expanded Phase 2 substitute matching score calculation details in `docs/02-system-design.md`.
- Why it mattered: The algorithm now has exact helper implementations, criterion-by-criterion formulas, step-by-step numeric examples, weight normalization examples, and explainability payloads for workload, competency, familiarity, recency, and preference/policy scoring.
- Date: 2026-04-27
- Change: Human approved MVP leave granularity change from full-day-only to full-day + AM/PM half-day leave.
- Why it mattered: Source docs now treat half-day leave as required MVP scope, with computed session impacts and audited admin impact corrections.
- Date: 2026-04-27
- Change: Updated `project/index.html` board coverage for FR-018 through FR-033.
- Why it mattered: Added tasks and validations for half-day leave, impacted-session adjustment, coverage queue, lifecycle reassignment/cancellation, availability/eligibility, preference/exclusion rules, coverage reporting, admin-created leave, and multi-role context.
- Date: 2026-04-27
- Change: Human approved source docs `00`-`04` enough for board cleanup, with requested refinements to schedule defaults/projections and recommendation run-status SLA.
- Why it mattered: Source document gate is no longer the primary blocker; next blocker is board readiness and approval.
- Date: 2026-04-27
- Change: Updated board for FR-001/FR-003 refinements and recommendation run-status SLA; reparented validation items under waves.
- Why it mattered: Board hierarchy now satisfies EPIC > wave > validation structure, and board coverage includes default timetable templates, generated schedule projections, and recommendation status/fallback UX.
- Date: 2026-04-27
- Change: Human approved remaining product/integration decisions: accept/decline substitute flow, teacher self-service availability, richer preference/exclusion rules, standalone-first MVP, mock notifications, and local calendar/resource ownership.
- Why it mattered: Removes major human-decision blockers; board must now be updated to reflect this larger MVP scope and standalone-first integration strategy.
- Date: 2026-04-27
- Change: Updated board for latest product/integration decisions.
- Why it mattered: Board now includes standalone auth, mock notifications, local calendar/resource ownership, teacher self-service availability, substitute accept/decline, and richer preference/exclusion rule coverage.


- Date: 2026-04-27
- Change: Completed full board contract/readiness pass in `project/index.html`.
- Why it mattered: All 59 task items, 9 integration items, and 17 validation items now have populated contracts with owned paths, touch points, integration surfaces, input/output contracts, ordered steps, quality gates, acceptance criteria, handoff expectations, and parallel/conflict metadata; board status moved to human review while all items remain `draft`.


- Date: 2026-04-27
- Change: Human approved the compiled board plan and first execution slice was opened.
- Why it mattered: Board approval gate is cleared; `TASK-057` and `TASK-001` are now ready while all later items remain draft until dependencies are satisfied.


- Date: 2026-04-27
- Change: Implemented first approved foundation slice (`TASK-057` and `TASK-001`).
- Why it mattered: Standalone roster auth/tenancy, seeded users/roles, session/CSRF guards, auth migration, and timetable/period migrations now exist with tests, typecheck, and build passing; next dependency-safe WAVE-001 tasks were marked ready.


- Date: 2026-04-27
- Change: Implemented next WAVE-001 foundation tasks (`TASK-002`, `TASK-003`, and `TASK-059`).
- Why it mattered: Class session conflict schema, timetable default/publish/projection service foundation, and local calendar/room/equipment services now exist with tests, typecheck, and build passing; `TASK-004` is the next ready WAVE-001 task.


- Date: 2026-04-27
- Change: Implemented `TASK-004` session service CRUD/conflict detection.
- Why it mattered: Class sessions now have a service-level CRUD boundary with explicit teacher and room double-book checks, actionable conflict codes, soft delete, tenant checks, and tests; `TASK-005` and `TASK-055` are now ready.


- Date: 2026-04-27
- Change: Implemented WAVE-001 API tasks (`TASK-005` and `TASK-055`).
- Why it mattered: Timetable/session REST routes and schedule projection API now exist behind standalone auth/CSRF with contract tests; all WAVE-001 implementation dependencies for `INTEGRATION-001` are complete.


- Date: 2026-04-27
- Change: Completed WAVE-001 convergence (`INTEGRATION-001`).
- Why it mattered: The backend/API foundation now has an integration proof across auth, CSRF, timetable/session routes, conflict errors, tenant boundaries, and schedule projections; WAVE-002 schedule planner UI tasks are now ready.


- Date: 2026-04-27
- Change: Implemented WAVE-002 schedule planner UI tasks (`TASK-006`, `TASK-007`, `TASK-008`, `TASK-009`, `TASK-010`, `TASK-054`).
- Why it mattered: A Vite/React schedule planner now supports default timetable startup, overview/readiness cards, session creation/editing, conflict-aware teacher assignment, publish/unpublish flow, and generated class/teacher/room/equipment views with frontend tests.

- Date: 2026-04-27
- Change: Completed WAVE-002 convergence (`INTEGRATION-002`).
- Why it mattered: The schedule planner now has an API-shaped frontend seam for timetable/session/publish operations, regression coverage for default-template through publish/projection behavior, and backend convergence evidence across auth, CSRF, conflicts, tenant boundaries, and projection APIs; WAVE-002 validation tasks are now ready.

- Date: 2026-04-27
- Change: Completed WAVE-002 browser validations (`VAL-003`, `VAL-014`) and first WAVE-003 schema task (`TASK-011`).
- Why it mattered: Browser evidence now proves the schedule planner default-template, publish, and projection flows; leave backend schema now supports full-day/AM/PM leave requests, computed/admin-adjusted session impacts, coverage status tracking, and active duplicate prevention.

- Date: 2026-04-27
- Change: Cleaned schedule planner browser UI copy and added a Steck-like app shell.
- Why it mattered: The browser preview now feels closer to the main Steck admin portal, with sidebar/header navigation and less explanatory marketing copy on the working page.

- Date: 2026-04-27
- Change: Aligned schedule planner typography and sizing with Steck web defaults.
- Why it mattered: The standalone module now uses Steck's font stack, 15px root sizing, heading scale, card radii, form sizing, and dashboard-style weights instead of the earlier prototype-specific typography.

- Date: 2026-04-27
- Change: Completed WAVE-003 leave backend convergence (`INTEGRATION-003`).
- Why it mattered: Full-day and AM/PM leave now work end-to-end through backend routes with integration tests for computed impacts, admin adjustments, rejected/cancelled impact closure, auth/CSRF, and tenant boundaries; WAVE-004 leave UI and mock notification tasks are now ready.

- Date: 2026-04-27
- Change: Implemented WAVE-004 leave UI and notification tasks (`TASK-015`, `TASK-016`, `TASK-017`, `TASK-018`).
- Why it mattered: The browser now has teacher leave application/status, admin leave queue and impact correction, and local/mock notification feedback, with frontend tests plus backend notification service tests passing; `TASK-052` admin-created leave records is now ready.

- Date: 2026-04-27
- Change: Implemented `TASK-052` admin-created leave records.
- Why it mattered: Admin-created leave now requires an audit reason, records the admin actor, computes the same full-day/AM/PM impacts, remains visible to the teacher, and is covered in API and browser tests; `INTEGRATION-004` is now ready.

- Date: 2026-04-27
- Change: Completed WAVE-004 leave end-to-end convergence (`INTEGRATION-004`).
- Why it mattered: Full-day, AM half-day, PM half-day, admin impact correction, admin-created leave, teacher status, and local/mock notifications worked together in browser/API test coverage; `VAL-004` and `VAL-011` were later re-blocked by the PostgreSQL persistence requirement.

- Date: 2026-04-27
- Change: Added real leave UI-to-API wiring (`TASK-060`).
- Why it mattered: Leave UI actions now use a real fetch client for standalone auth/CSRF, schedule-session sync, teacher/admin leave creation, impact adjustment, and approve/reject routes instead of remaining browser-state-only; API/web tests, typecheck, build, and a live browser smoke against Fastify+Vite pass.
- Date: 2026-04-27
- Change: Human clarified the module must be PostgreSQL-backed now and must strictly follow existing Steck DB schema for any table/entity Steck already owns.
- Why it mattered: The previous in-memory runtime and prototype-only `roster_*` table plan are no longer sufficient; board validation must be paused until Steck-compatible persistence is implemented.
- Date: 2026-04-27
- Change: Completed `TASK-061` Steck-compatible PostgreSQL migration runner and schema baseline.
- Why it mattered: The API now has `DATABASE_URL`/`DATABASE_SCHEMA` config, a `pg` database helper, schema-safe migration runner, Steck core table baseline, module-owned `rostering_*` tables, and tests proving duplicate prototype core tables are not used in the new baseline.
- Date: 2026-04-27
- Change: Completed `TASK-062` PostgreSQL auth and tenant adapter.
- Why it mattered: Standalone login/session behavior can now persist through Steck-compatible auth, membership, role, teacher, school, and session tables when PostgreSQL is configured; `TASK-063` schedule/resource/calendar persistence is now ready.
- Date: 2026-04-27
- Change: Completed `TASK-063` PostgreSQL timetable, schedule, resource, and calendar repositories.
- Why it mattered: Schedule planning, projections, rooms, equipment, and calendar exceptions can now persist through `rostering_*` tables when PostgreSQL is configured; `TASK-064` leave/audit/notification persistence is now ready.
- Date: 2026-04-27
- Change: Completed `TASK-064` PostgreSQL leave, impact, audit, and notification repositories.
- Why it mattered: Leave lifecycle data, computed impacts, audit events, notification events, notification rows, and mock email records can now persist through Steck-compatible PostgreSQL tables when configured; `INTEGRATION-010` runtime convergence is now ready.
- Date: 2026-04-27
- Change: Completed `INTEGRATION-010` API runtime convergence on PostgreSQL repositories.
- Why it mattered: The runtime now requires `DATABASE_URL` unless explicitly opted into in-memory fallback, all in-scope services are wired to PostgreSQL repositories when configured, browser schedule/leave clients call backend routes, publish/unpublish updates persisted session exposure state, live PostgreSQL tests passed, and restart smoke evidence at `/tmp/schoolroster_smoke_evidence.json` proves a timetable/session/leave/impact survived API restart.
- Date: 2026-04-27
- Change: Switched local DB validation to the existing Docker Postgres 18 container `pglocal` and completed `VAL-018`.
- Why it mattered: The project now has reusable pglocal scripts (`dev:api:pglocal`, `test:api:pglocal`, `validate:pglocal`), validation evidence in `output/val-018-pglocal-evidence.json`, and `VAL-004`/`VAL-011` are unblocked as persistence-backed leave validations.
- Date: 2026-04-28
- Change: Completed persistence-backed leave validations `VAL-004` and `VAL-011`.
- Why it mattered: Browser automation against the Postgres 18 `pglocal` API proved full-day, AM half-day, PM half-day, teacher leave confirmation/notifications, and admin impact adjustment with a reason. The run also fixed two validation bugs: persisted sessions returned from the schedule API now hydrate back into the browser state, and CORS preflight now permits PATCH/DELETE browser mutations.
- Date: 2026-04-28
- Change: Completed WAVE-005 substitute matching foundation tasks (`TASK-019`, `TASK-022`, `TASK-023`, `TASK-024`).
- Why it mattered: PostgreSQL migrations now include school-scoped substitute rule configs, teacher competencies, and teacher class familiarities with Steck-compatible foreign keys and indexes; default rule configs are seeded; workload balance, subject competency, and class familiarity scorers now implement the documented formulas with unit tests and pglocal PostgreSQL validation passing. `TASK-025` is now ready.
- Date: 2026-04-28
- Change: Completed `TASK-025` weighted composite scoring and ranking.
- Why it mattered: The algorithm can now normalize enabled school rule weights, combine workload/competency/familiarity/recency/preference scores, filter infeasible or hard-excluded candidates, produce explainability breakdowns/raw inputs, and rank 100 candidates within the MVP performance target. `TASK-026` recommendation API is now ready.
- Date: 2026-04-28
- Change: Completed `TASK-026` substitute recommendation API.
- Why it mattered: Admins can now call the recommendation endpoint for a leave/session pair and receive ranked explainable substitute candidates backed by the composite scorer, with a polling endpoint for recommendation job status. API tests and pglocal PostgreSQL tests cover sync recommendations, async-style polling, permission denial, and invalid input. `TASK-049` and `TASK-056` are now ready.
- Date: 2026-04-28
- Change: Completed `TASK-049` teacher availability and hard eligibility support.
- Why it mattered: Substitute recommendations now run Phase 1 hard filters before scoring, including availability overrides, same-period conflicts, approved leave, optional competency requirements, configured exclusions, and weekly assignment caps. The new availability API supports teacher self-service/back-office writes with tenant and self-scope checks, and `TASK-058` is now ready for UI work.
- Date: 2026-04-28
- Change: Completed `TASK-056` durable/idempotent recommendation job status service.
- Why it mattered: Recommendation status is now stored through an explicit job repository with PostgreSQL support, deterministic job IDs, completed-result caching, idempotent retry behavior, and school-scoped polling. This gives the UI a stable API-031 contract while keeping the MVP computation in-process for speed.
- Date: 2026-04-28
- Change: Completed `TASK-058` teacher self-service availability UI.
- Why it mattered: The browser now exposes teacher-owned availability overrides for full-day, AM/PM half-day, and single-period states through API-025, with frontend coverage for self-only teacher payloads, half-day period expansion, refresh, and override list states. `TASK-020` rule-config service and admin UI is now ready.
- Date: 2026-04-28
- Change: Completed `TASK-020` rule-config service and admin UI.
- Why it mattered: Admins can now read and patch school rule configs through API-015/API-016, invalid weights/no-enabled-scoring configs are rejected, changes are audited, recommendation scoring consumes updated enabled weights, and the browser includes a Steck-style rule configuration panel. `INTEGRATION-005` and `TASK-050` are now ready.
- Date: 2026-04-28
- Change: Completed `INTEGRATION-005` rule-config convergence.
- Why it mattered: Dedicated integration coverage now proves rule weight changes, teacher availability overrides, and recommendation ranking/filtering work together through the API, while browser coverage confirms rule configuration and teacher availability are reachable from the roster shell. `TASK-050` remains the next ready WAVE-005 item.
- Date: 2026-04-28
- Change: Completed `TASK-050` rich preference/exclusion rule management.
- Why it mattered: Schools can now configure preferred substitutes, soft avoid penalties, and hard exclusions through API-026 and the browser rule screen; recommendation scoring applies only the strongest matching scope for each candidate and pglocal PostgreSQL validation passes with preference rules persisted.
- Date: 2026-04-28
- Change: Completed `INTEGRATION-006` algorithm convergence.
- Why it mattered: WAVE-005 algorithm parts now have one convergence proof across scoring weights, competency, familiarity, availability, preference/exclusion rules, explainability, async job status, and idempotent retry; WAVE-005 validation items are now ready.
- Date: 2026-04-28
- Change: Completed WAVE-005 validations (`VAL-001`, `VAL-007`, `VAL-016`).
- Why it mattered: Algorithm correctness, recommendation performance/status behavior, and teacher availability effects on recommendations now have local and pglocal evidence. Validation also fixed stale synchronous recommendations after availability changes while preserving async idempotent retry behavior.
- Date: 2026-04-28
- Change: Completed `TASK-027` substitute recommendation panel in Leave Management.
- Why it mattered: Admins can now load backend-ranked recommendations directly from impacted leave sessions, see calculation status/progress, retry or use fallback controls, and select a ranked candidate in the UI. Follow-up WAVE-006 tasks still need to add full score-breakdown expansion, manual override search, and persisted substitute offer/assignment creation.
- Date: 2026-04-28
- Change: Completed `TASK-028` recommendation score breakdown UI.
- Why it mattered: Admins can inspect why a substitute ranked highly before selecting them, including criterion weights/contributions, criterion detail text, and raw workload/competency/recency context. Manual override search and persisted offer creation remain next.
- Date: 2026-04-28
- Change: Completed `TASK-029` manual override search and selection.
- Why it mattered: Admins can now bypass recommendations from the same leave-impact panel, search all teachers, see availability/conflict labels, confirm an override, and see local audit-log evidence. Persisted substitute offer creation and notifications remain next in `TASK-030`.
- Date: 2026-04-28
- Change: Completed `TASK-030` substitute offer confirmation and notification.
- Why it mattered: Selected recommended/manual substitutes can now be persisted as offered assignments through the backend, with impact coverage updated to assigned, audit written, and mock/local substitute notification emitted. This unblocks teacher accept/decline UI, unfilled queue, and reassignment lifecycle tasks.
- Date: 2026-04-29
- Change: Completed `TASK-031` teacher substitute offers and assignments page.
- Why it mattered: Substitute teachers can now see only their own offers, view class/period/room/original-teacher details, accept or decline, and their response updates assignment status, coverage status, audit, and admin notifications. This leaves unfilled queue and cancellation/reassignment as the remaining WAVE-006 implementation tasks before convergence.
- Date: 2026-04-29
- Change: Completed `TASK-047` unfilled coverage queue.
- Why it mattered: Admins can now list active unfilled leave impacts through an admin-only backend route, filter by date and absent teacher in the browser, navigate back to the leave assignment flow, and mark gaps as no-coverage-needed so they leave the queue. Web/API/typecheck/build and Postgres 18 `pglocal` validation passed; `TASK-048` cancellation/reassignment lifecycle is now the next ready WAVE-006 task.
- Date: 2026-04-29
- Change: Completed `TASK-048` coverage lifecycle cancellation and reassignment service.
- Why it mattered: Admins can now cancel assignments with reasons, complete accepted/assigned coverage, and reassign coverage without deleting history; impact coverage status, audit events, and notifications stay synchronized. Full web/API/typecheck/build and Postgres 18 `pglocal` validation passed; `INTEGRATION-007` is now ready.
- Date: 2026-04-29
- Change: Completed `INTEGRATION-007` substitute assignment end-to-end convergence.
- Why it mattered: One integration test now proves recommendation job/status, offer creation, teacher assignment visibility/acceptance, completion, declined coverage entering the unfilled queue, reassignment, cancellation, queue reappearance, and permission denial together. Full web/API/typecheck/build and Postgres 18 `pglocal` validation passed; `VAL-005`, `VAL-012`, and `VAL-015` are now ready for browser evidence.
- Date: 2026-04-29
- Change: Completed `VAL-005` browser validation for admin substitute assignment.
- Why it mattered: Browser automation against the pglocal API and Vite UI proved the human-facing admin assignment path: default timetable, published session, leave submission, recommendations, substitute selection, offer send, assigned coverage status, and `substitute.offered` notification. Evidence is saved under `output/`.

## Notes for New Contributors or Agents [AIH]
- Start here: Read `AGENTS.md`, `docs/00-app-definition.md`, this file, `docs/07-decision-log.md`, then inspect `project/index.html`.
- This is a module for Steck: `~/steck` contains the target monorepo. This repo is for separate MVP development.
- Before coding: confirm source readiness, board approval, task contracts, and blockers first.

- Date: 2026-04-29
- Change: Completed WAVE-006 browser validations (`VAL-012` and `VAL-015`) against the Vite app and existing Docker Postgres 18 `pglocal` API.
- Why it mattered: Substitute assignment lifecycle and recommendation run-status/fallback flows now have human-reviewable browser evidence, so WAVE-006 can close after the full quality gate.

- Date: 2026-04-29
- Change: Implemented `TASK-033` roster audit query service and admin API.
- Why it mattered: Existing append-only Steck-compatible `audit_events` are now queryable by admins with tenant/role enforcement and PostgreSQL-backed validation, enabling audit review and report/export work.

- Date: 2026-04-29
- Change: Completed `TASK-034` audit write coverage for class session mutations and verified full local plus Postgres 18 `pglocal` quality gates.
- Why it mattered: Schedule session amendments now join leave, substitute, rules, and availability mutations in the admin-queryable audit trail, unblocking report work.
- Date: 2026-04-29
- Change: Completed WAVE-007 reports, coverage operations, CSV export, and validations.
- Why it mattered: Admins now have PostgreSQL-backed workload, leave summary, substitute history, and coverage operations reports in the browser, CSV downloads preserve Excel-compatible UTF-8 BOM bytes, and API/component/browser/pglocal evidence proves the reporting workflow before Steck merge planning.

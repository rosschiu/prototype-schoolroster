# System Design

- Human Action: REVIEW AND CHANGE
- Status: READY
- Owner: AI draft, human approved
- Inputs: `docs/00-app-definition.md`, `docs/01-product-and-ux.md`, Steck architecture (`docs/07-technical-architecture.md`)
- Owns: Domain model, data model, architecture, integrations, APIs/contracts, services, jobs, and technical constraints
- Must Not Repeat: Product rationale, UX design details, security policy text, release procedures, or task breakdowns
- Update Trigger: Change in architecture, data model, API contract, integration, platform choice, or major technical constraint
- Mode Applicability: Prototype / MVP / Production

## Purpose
Define how the module is structured technically and how product behavior maps to domain, data, APIs, and integrations.

## Technical Summary [AIH]
- App type/platform: Web module within Steck ecosystem. Separate repo for MVP development; merges back into Steck monorepo.
- Proposed stack: React + Vite (frontend), Fastify + Node.js (backend), PostgreSQL (database), TypeScript throughout. Reuse Steck `packages/ui`, `packages/contracts`, `packages/config`.
- Runtime/deployment target: Docker Compose for MVP; merges into Steck's existing deployment.
- Existing codebase constraints: Must conform to Steck modular monolith boundaries, school tenancy, RBAC, shared contracts, and audit patterns.
- Key technical risks: Clean merge back into Steck; algorithm performance and correctness; schedule conflict validation complexity.

## Architecture Overview [AIH]
- App shell / entrypoints: Frontend routes under `/roster/*`; backend domain under `apps/api/src/rostering/`.
- Frontend structure: Feature folders `features/roster-schedule`, `features/roster-leave`, `features/roster-substitutes`, `features/roster-reports` in `apps/web/src/features/`.
- Backend/API structure: Domain modules: `timetable`, `session`, `leave`, `substitute`, `coverage`, `roster-report`, `rule-config`. Each owns services, routes, and repository logic.
- Data/persistence layer: PostgreSQL only for in-scope MVP flows. Existing Steck tables are authoritative and reused as-is; rostering adds module-owned tables only for timetable, recurring schedule sessions, leave, substitute assignments, availability, rules, and resources not already present in Steck.
- Background jobs/workers: Leave notification fanout (via Steck notification service); potential async report generation if needed.
- External integrations: none required for early MVP runtime, but the standalone runtime must persist through Steck-compatible tables/adapters. Implement local calendar/resource data and mock/local notification delivery first; integrate Steck runtime services near app readiness/merge without changing persisted data shape.
- Shared packages/modules: `packages/contracts` for new API types; `packages/ui` for schedule grid and leave UI components.

## Domain Model [AIH]
| Entity/concept | Description | Key fields | Relationships | Lifecycle notes |
|---|---|---|---|---|
| timetable | Term-level schedule definition (days, periods) | school_id, term_id, days, periods, effective_dates | belongs to school/term | Active per term; one per term typical |
| timetable_period | A single period slot (day, start_time, end_time) | timetable_id, day_index, period_index, start_time, end_time | belongs to timetable | Immutable once sessions reference it |
| rostering_schedule_session | A recurring scheduled teaching slot in a timetable | school_id, term_id, timetable_period_id, subject_id, grade_level_id, section, room/resource ids, assigned_teacher_id | belongs to timetable_period, subject, teacher, optional room/equipment/resources | Active/archived per term; intentionally separate from Steck dated `class_sessions` |
| generated_schedule_projection | Read model generated from published sessions | projection_type, school_id, term_id, owner_id, sessions[] | derived from rostering_schedule_session | Supports class schedule, teacher roster, room schedule, equipment/resource schedule |
| leave_request | Teacher leave application | teacher_id, school_id, dates, duration_type, type, reason, status, requested_at | affects rostering_schedule_sessions | Pending → Approved/Rejected/Cancelled |
| leave_session_impact | Mapping of leave to affected sessions | leave_request_id, schedule_session_id, date, coverage_required, source | links leave to recurring schedule session | Computed at request time; admin may adjust with audit |
| substitute_assignment | Record of a substitute covering a session | leave_request_id, schedule_session_id, original_teacher_id, substitute_teacher_id, assigned_by, assigned_at, status | links leave + schedule session + teachers | Proposed/Assigned/Acknowledged/Accepted/Declined/Completed/Cancelled/Unfilled as approved for MVP |
| substitute_rule_config | School-specific algorithm weights | school_id, criteria_key, weight, enabled, custom_params | belongs to school | Admin-managed |
| substitute_availability | Teacher/substitute availability override | teacher_id, school_id, date, timetable_period_id, availability_status, reason | used by substitute matching | Teacher self-service plus admin oversight in MVP |
| substitute_preference_rule | Preferred/excluded substitute relationship | school_id, teacher_id, subject_id, grade_level_id, schedule_session_id, preference_type, weight_or_reason | used by substitute matching | Supports preferred and excluded substitutes |
| teacher_competency | Teacher's subject expertise | teacher_id, subject_id, level (primary/secondary/capable) | links teacher to subject | Admin-managed or imported |
| teacher_class_familiarity | Historical relationship between teacher and class/slot | teacher_id, schedule_session_id or class_id, familiarity_score, last_taught_term | derived + admin editable | Updated each term |
| school_calendar_exception | Non-standard teaching day | school_id, term_id, date, exception_type, replacement_day_index, notes | affects leave impact and sessions | Holidays/no-school/special timetable days |
| audit_event | Audit for roster changes using Steck audit schema | actor_user_id, event_type, object_type, object_id, school_id, reason, metadata | belongs to school | Append-only in Steck `audit_events` |

## Data Model [AIH]
| Table/store/model | Fields | Indexes/constraints | Ownership | Migration notes |
|---|---|---|---|---|
| schools | id, name, short_name, timezone, timestamps | Steck existing constraints | Steck core | Reuse existing Steck table exactly; no `roster_schools` |
| auth_users | id, email, display_name, preferred_locale, password_hash, status, timestamps | Steck existing constraints | Steck auth | Reuse existing Steck table exactly; no `roster_users` |
| school_memberships | id, user_id, school_id, status, timestamps | UNIQUE(user_id, school_id) | Steck auth | Reuse existing Steck table exactly |
| role_assignments | id, membership_id, role, actor_id, created_at | UNIQUE(membership_id, role) | Steck auth | Reuse existing Steck table exactly |
| auth_sessions | id, user_id, school_id, active_role, session_token_hash, csrf_token_hash, ip_address, user_agent, timestamps | session_token_hash unique | Steck auth | Standalone runtime may write here through an adapter |
| teachers | id, school_id, display_name, timestamps | school_id | Steck core | Teaching, leave, substitute, competency, and availability references use `teachers.id` |
| academic_years / terms | Steck academic year and term fields | Steck existing constraints | Steck core | Reuse existing Steck tables; no `roster_terms` |
| grade_levels / subjects | Steck grade and subject fields | Steck existing constraints | Steck core | Reuse existing Steck tables for schedule dimensions |
| audit_events | Steck audit fields | school_id + created_at | Steck audit | Rostering writes event_type/object_type/metadata here; no `roster_audit_events` |
| notification_events / notifications / email_deliveries | Steck notification fields | recipient/read indexes | Steck notification | Mock delivery may be local, but persisted notification shape follows Steck |
| rostering_timetables | id, school_id, term_id, name, template_key, template_version, timezone, default_period_minutes, AM/PM grouping config, status, timestamps | UNIQUE(school_id, term_id, name); school_id + term_id; status | timetable service | New module-owned table referencing Steck `schools` and `terms` |
| rostering_timetable_periods | id, timetable_id, school_id, day_index, period_index, label, start_time, end_time, half_day, sort_order, is_teaching_period, metadata_json | UNIQUE(timetable_id, day_index, period_index); timetable + half_day | timetable service | New module-owned table |
| rostering_schedule_sessions | id, school_id, term_id, timetable_id, timetable_period_id, subject_id, grade_level_id, section, room_id, assigned_teacher_id, status, notes, timestamps | teacher + period active unique; room + period active unique; school + term | session service | New module-owned recurring-slot table; do not reuse Steck dated `class_sessions` |
| rostering_rooms | id, school_id, name, room_code, capacity, status, metadata_json, timestamps | UNIQUE(school_id, name/code) | resource service | New because Steck only has `room_label` on classes today |
| rostering_equipment_resources | id, school_id, name, resource_type, quantity, status, metadata_json, timestamps | UNIQUE(school_id, name) | resource service | New because Steck has no structured equipment source today |
| rostering_schedule_session_equipment_resources | schedule_session_id, equipment_resource_id, quantity | PK(schedule_session_id, equipment_resource_id) | session/resource services | New join table |
| rostering_school_calendar_exceptions | id, school_id, term_id, exception_date, exception_type, replacement_day_index, notes, timestamps | UNIQUE(school_id, exception_date) | timetable/calendar service | New local source unless Steck later adds calendar |
| rostering_leave_requests | id, school_id, teacher_id, start_date, end_date, duration_type, leave_type, reason, coverage_required, substitute_notes, status, reviewed_by, reviewed_at, created_by, requested_at, timestamps | school + status + dates; teacher + dates | leave service | New module-owned table; `teacher_id` references Steck `teachers`, actor fields reference `auth_users` |
| rostering_leave_session_impacts | id, school_id, leave_request_id, schedule_session_id, impact_date, coverage_required, coverage_status, status, source, admin_adjustment_reason, adjusted_by, adjusted_at, timestamps | leave + status; schedule_session + date; active unique | leave/coverage service | New module-owned table |
| rostering_substitute_assignments | id, school_id, leave_request_id, schedule_session_id, original_teacher_id, substitute_teacher_id, assigned_by, assigned_at, status, acknowledged_at, accepted_at, declined_at, completed_at, canceled_at, cancellation_reason | school + status; substitute + status; active no double-book | substitute service | New module-owned table |
| rostering_substitute_rule_configs | id, school_id, criteria_key, weight, enabled, custom_params, updated_at | UNIQUE(school_id, criteria_key) | rule-config service | New module-owned table |
| rostering_substitute_availabilities | id, school_id, teacher_id, date, timetable_period_id, availability_status, reason, updated_by, updated_at | teacher + date + period | substitute service | New module-owned table |
| rostering_substitute_preference_rules | id, school_id, teacher_id, subject_id, grade_level_id, schedule_session_id, preference_type, weight, reason, updated_at | school + preference_type | rule-config service | New module-owned table |
| rostering_teacher_competencies | id, teacher_id, subject_id, level, updated_at | UNIQUE(teacher_id, subject_id) | session/roster service | New module-owned table referencing Steck `teachers` and `subjects` |
| rostering_teacher_class_familiarities | id, teacher_id, schedule_session_id, class_id, familiarity_score, last_taught_term, updated_at | UNIQUE by teacher + target | substitute service | New module-owned table; may reference Steck `classes` when generated/linked |

### Steck Schema Compatibility Rules
- Do not create module-owned duplicates of Steck core tables (`schools`, `auth_users`, `school_memberships`, `role_assignments`, `auth_sessions`, `teachers`, `terms`, `grade_levels`, `subjects`, `audit_events`, `notification_events`, `notifications`).
- `teacher_id`, `assigned_teacher_id`, `original_teacher_id`, and `substitute_teacher_id` reference Steck `teachers(id)`.
- Human actor fields such as `created_by`, `reviewed_by`, `adjusted_by`, and `assigned_by` reference Steck `auth_users(id)`.
- Rostering recurring schedule slots use `rostering_schedule_sessions`; Steck `class_sessions` remains a dated lesson/session table and must not be overloaded.
- PostgreSQL migrations must support Steck's configurable schema name (`DATABASE_SCHEMA`, default in Steck is `draft_edu_v2`) and should use the same `pg`-based database helper style.

## State Management [AIH]
- Client state: React local state + data-fetching helpers. Schedule planner may use optimistic UI for drag-and-drop.
- Server state/cache: Request/refresh model initially. Schedule and leave data are low-frequency update.
- URL state: Filter/sort params for leave list and reports.
- Session/auth state: standalone secure session for MVP may be kept as a runtime adapter, but persisted sessions should use Steck-compatible `auth_sessions` shape.
- Offline/local state if any: Draft leave application saved locally before submit (optional).

## API / Contract Inventory [AIH]
Use stable IDs so implementation and validation tasks can map to contracts.

| ID | Surface | Method/event | Input | Output | Errors | Auth |
|---|---|---|---|---|---|---|
| API-001 | /roster/timetables | POST | school_id, term_id, name, days, periods | timetable | validation, conflict | admin |
| API-002 | /roster/timetables/:id | GET | timetable_id | timetable + periods | not_found | admin/teacher |
| API-003 | /roster/timetables/:id/publish | POST | timetable_id | published timetable | not_found, conflict | admin |
| API-004 | /roster/sessions | POST | timetable_period_id, subject_id, grade_level_id, section, room, teacher_id | schedule_session | validation, double_book | admin |
| API-005 | /roster/sessions/:id | PATCH | session fields | updated session | not_found, conflict | admin |
| API-006 | /roster/sessions/:id | DELETE | session_id | success | not_found | admin |
| API-007 | /roster/teacher-roster | GET | teacher_id, term_id | list of sessions | not_found | teacher (self) / admin |
| API-008 | /roster/leave | POST | start_date, end_date, duration_type, type, reason, coverage_required, substitute_notes | leave_request + computed impacts + warnings | validation | teacher (self); admin on behalf |
| API-009 | /roster/leave | GET | filters (status, teacher, date) | list of leave_requests | — | admin; teacher (self) |
| API-010 | /roster/leave/:id/approve | POST | leave_id, substitute_assignments[] | approved leave + assignments | not_found, conflict | admin |
| API-011 | /roster/leave/:id/reject | POST | leave_id, reason | rejected leave | not_found | admin |
| API-012 | /roster/substitutes/recommend | GET | leave_id, session_id | ranked list of candidates | not_found | admin |
| API-013 | /roster/substitutes | POST | leave_id, session_id, substitute_teacher_id | substitute_assignment | not_found, conflict | admin |
| API-014 | /roster/substitutes/my | GET | — | list of my substitute assignments | — | teacher |
| API-015 | /roster/rules | GET | — | rule config list | — | admin |
| API-016 | /roster/rules | PATCH | rule updates | updated rules | validation | admin |
| API-017 | /roster/reports/workload | GET | term_id, filters | workload data | — | admin |
| API-018 | /roster/reports/leave-summary | GET | term_id, filters | leave summary data | — | admin |
| API-019 | /roster/reports/substitute-history | GET | term_id, filters | substitute history data | — | admin |
| API-020 | /roster/competencies | POST | teacher_id, subject_id, level | competency | validation | admin |
| API-021 | /roster/familiarities | POST | teacher_id, schedule_session_id or class_id, score | familiarity | validation | admin |
| API-022 | /roster/leave/:id/cancel | POST | leave_id, reason | canceled leave + canceled/open coverage | not_found, invalid_state | admin; teacher self before approval |
| API-023 | /roster/substitutes/:id/status | PATCH | assignment_id, status, reason | updated assignment | not_found, invalid_state | admin; assigned substitute for allowed response statuses |
| API-024 | /roster/coverage/unfilled | GET | term_id, filters | unfilled coverage sessions | — | admin |
| API-025 | /roster/availability | GET/PATCH | teacher_id, date range, period statuses | availability records | validation | admin; teacher self if self-service approved |
| API-026 | /roster/preferences | GET/PATCH | preferred/excluded teacher rules | preference rules | validation | admin |
| API-027 | /roster/calendar-exceptions | GET/PATCH | term_id, dates, exception_type | calendar exceptions | validation | admin |
| API-028 | /roster/reports/coverage-operations | GET | term_id, filters | fill rate, unfilled, cancellations, time-to-fill | — | admin |
| API-029 | /roster/leave/:id/impacts | PATCH | impact additions/removals, coverage_required updates, adjustment_reason | updated leave_session_impacts | validation, invalid_state | admin |
| API-030 | /roster/schedule-projections | GET | term_id, projection_type (`class`/`teacher`/`room`/`equipment`), owner_id | generated schedule projection | validation, not_found | admin; teacher self for own projection |
| API-031 | /roster/substitutes/recommendations/:job_id | GET | job_id | recommendation job status, progress, result when complete | not_found, failed | admin |
| API-032 | /roster/timetables/:id/periods | PATCH | periods[] with day_index, period_index, label, start_time, end_time, half_day, sort_order, is_teaching_period | timetable + periods | validation, existing_sessions, not_found | admin |
| API-033 | /roster/timetables/:id/confirm-structure | POST | timetable_id | timetable + periods with structure_confirmed_at | validation, not_found | admin |

## Integration Inventory [AIH]
| Integration | Purpose | Real/mocked | Auth/secrets | Failure behavior | Validation approach |
|---|---|---|---|---|---|
| Standalone auth/session | Authentication and role context for MVP | Real for MVP | Local secure session cookie | Redirect to login | Integration tests |
| Standalone auth adapter | Email/password/session runtime for standalone MVP using Steck-compatible auth tables | Real for MVP | PostgreSQL + secure cookies | Redirect to login | Integration tests |
| Steck-compatible users/roles | User identity, memberships, roles, and teacher actors through Steck-shaped tables | Real for MVP | PostgreSQL | Error if unavailable | Integration tests |
| Steck-compatible school/term | School tenancy and academic term data through Steck-shaped tables | Real for MVP | PostgreSQL | Error if unavailable | Integration tests |
| Mock/local notifications | In-app + email-like notification for leave and substitute | Mock/local for MVP | No external secret | Persist/log and expose in app | Integration tests |
| Steck-compatible roster audit | Write roster audit events into Steck `audit_events` shape | Real for MVP | PostgreSQL | Fail closed for critical mutations | Integration tests |
| Steck runtime services | Runtime service reuse for auth/notifications/email after merge | Deferred | Steck services | Validate during merge readiness | Merge validation tasks |

## Service / Module Boundaries [AIH]
| Module/service | Responsibility | Inputs | Outputs | Used by | Notes |
|---|---|---|---|---|---|
| timetable service | CRUD timetable structure; sensible defaults/templates; publish | admin commands | timetable, periods, AM/PM groups | session service, UI | One per term; templates reduce blank-slate setup |
| session service | CRUD class sessions; conflict detection; schedule projections | admin commands, timetable | sessions, class/teacher/room/equipment projections | leave service, substitute service, UI | Enforces teacher, room, and equipment/resource double-book rules |
| leave service | Leave application lifecycle; impact calculation | teacher/admin request, duration_type, coverage flag, calendar exceptions | leave requests, impacts | substitute service, coverage service, notification | MVP supports full-day, AM half-day, and PM half-day leave; arbitrary teacher-selected periods remain future |
| substitute service | Recommendation algorithm; assignment lifecycle | leave + session + rules + availability + preferences | ranked candidates, assignments | UI, notification, coverage service | Core algorithm module |
| coverage service | Track coverage status and unfilled queue | leave impacts, assignment events | covered/unfilled/no-coverage-needed status | admin UI, reports | Keeps absence recording separate from coverage fulfillment |
| rule-config service | CRUD substitute rule weights, hard constraints, preferences/exclusions | admin commands | rule config | substitute service | Per-school |
| roster-report service | Aggregate workload, leave, substitute data | queries | report data | UI | Read-only aggregates |
| roster-audit service | Write/query roster-specific audit | domain events | audit events | all roster services | Append-only |

## Leave Granularity And Impact Calculation [AIH]
MVP supports full-day and half-day leave because partial-day absence is a real school workflow. Arbitrary teacher-selected session/period leave is still deferred unless humans approve it later.

### Duration Types
| Duration type | Meaning | Teacher-facing? | Impact calculation |
|---|---|---|---|
| `full_day` | Teacher is absent for the full school day | Yes | Include all teacher sessions on each selected date |
| `am_half_day` | Teacher is absent for the morning half day | Yes | Include teacher sessions whose periods are in AM |
| `pm_half_day` | Teacher is absent for the afternoon half day | Yes | Include teacher sessions whose periods are in PM |

### Half-Day Boundary Configuration
Each school/term must define one of:
1. Preferred: explicit period groups: `am_period_indexes[]` and `pm_period_indexes[]`.
2. Fallback: `half_day_boundary_time`, default `12:00`, where periods starting before boundary are AM and periods starting at/after boundary are PM.

If a period overlaps the boundary and no explicit period group exists:
- Include the period in the computed impacts.
- Add warning code `PERIOD_OVERLAPS_HALF_DAY_BOUNDARY`.
- Require admin review before approval/assignment if the school config marks boundary review as required.

### Impact Calculation Algorithm
Inputs:
- `leave_request.teacher_id`
- `start_date`, `end_date`
- `duration_type`
- teacher's published `rostering_schedule_sessions`
- `school_calendar_exceptions`
- half-day boundary config

Algorithm:
```
dates = each school day from start_date to end_date, excluding no-school calendar exceptions
for each date in dates:
  sessions = published sessions for teacher_id on date
  if duration_type == "full_day":
    impacted = sessions
  if duration_type == "am_half_day":
    impacted = sessions where period is AM
  if duration_type == "pm_half_day":
    impacted = sessions where period is PM

  for each impacted session:
    create leave_session_impact with:
      source = "system_computed"
      coverage_required = leave_request.coverage_required
      coverage_status = coverage_required ? "unfilled" : "no_coverage_needed"
```

Admin correction:
- Admin can add/remove impacted sessions or toggle `coverage_required` through `API-029`.
- Every correction requires `admin_adjustment_reason`.
- Removed impacts should be retained as `source = "admin_removed"` / inactive rather than hard-deleted when audit history is required.
- Substitute recommendation only runs for final impacts where `coverage_required = true` and `coverage_status` is not `canceled` or `no_coverage_needed`.

## Schedule Defaults And Generated Projections [AIH]
School admins should not need to start from an empty technical configuration.

### Timetable Defaults
The timetable service should provide school-scoped defaults:
- Default 5-day week template.
- Common period block templates, including AM/PM grouping needed for half-day leave.
- Editable start/end times and period labels.
- Optional room/equipment/resource defaults if Steck has existing resource data.

Admins can accept a template, amend it inline, then publish only after validation passes.

Implementation rule:
- Creating a timetable from a default template creates editable period rows but does not mark the timetable structure as confirmed.
- Class session entry is locked in the browser until `structure_confirmed_at` is set.
- `API-032` replaces the draft timetable period set and clears `structure_confirmed_at`.
- `API-032` is blocked once active class sessions exist for the timetable; remapping existing sessions is a future enhancement.
- `API-033` validates period labels, HH:MM times, non-overlap within each day, unique day/period keys, at least one teaching period, and at least one AM and PM teaching period.
- Publish is blocked until `structure_confirmed_at` exists.
- Non-teaching periods remain in the timetable grid for admin visibility but are not valid class-session period options.

### Generated Schedule Projections
`rostering_schedule_sessions` remains the source of truth for recurring roster planning. The system generates these read projections:
- `class`: schedule per grade/section/class.
- `teacher`: roster per teacher.
- `room`: room usage schedule.
- `equipment`: equipment/resource schedule.

Projection generation rules:
- Recompute projections on schedule publish and when a published schedule is amended.
- Validate teacher double-booking, room double-booking, and equipment/resource double-booking before publish.
- Teacher users can only view their own teacher projection.
- Admin users can view all projections for their school/term.

## Substitute Matching Algorithm Specification [AIH]

### Purpose
Formalize the multi-criteria scoring methodology for the substitute teacher recommendation engine. This section replaces the hand-wavy "algorithm is O(n) per candidate" placeholder with exact formulas, normalization strategy, fairness metrics, explainability contract, and testing strategy.

### Problem Formalization
Given:
- A `leave_request` L submitted by teacher T_leave for date D
- The set of `rostering_schedule_session` objects S = {s₁, s₂, ... sₖ} affected by L on D
- The set of all teachers U = {u₁, u₂, ... uₙ} in the school for the active term
- School-specific rule configuration R = {w₁, w₂, w₃, w₄, caps, penalties, enabled_flags}

For each affected session s ∈ S, produce:
- A ranked list of candidate substitutes C_s = [(u, score_u, breakdown_u), ...]
- Ordered by `score_u` descending
- Where every candidate u is **feasible** (passes hard constraints)
- And `breakdown_u` is an explainable decomposition of `score_u`

### Algorithm Architecture: Three-Phase Pipeline

```
Phase 1: Feasibility Filter      → Remove ineligible candidates
Phase 2: Multi-Criteria Scoring   → Compute normalized sub-scores per candidate
Phase 3: Ranking + Explainability → Composite score, sort, emit breakdown
```

**Phase 1 — Feasibility Filter (Hard Constraints)**
A candidate u is infeasible for session s on date D if ANY of the following hold:

| Constraint | Source | Enforcement |
|---|---|---|
| Double-booked | u already has a `rostering_schedule_session` at the same `timetable_period` as s on D | Session query |
| On leave | u has an approved `leave_request` covering D | Leave query |
| Unavailable | u has `substitute_availability.availability_status = unavailable` for D/session | Availability query |
| Not qualified | u lacks required competency/certification configured as a hard constraint for s.subject_id/grade_level_id | Competency/rule query |
| Weekly cap exceeded | u's substitute_assignment count for the current week ≥ `weekly_substitute_cap` (configurable, default 5) | Aggregate query on `substitute_assignments` |
| Excluded | u is in school-configured exclusion list for s.subject_id or s.grade_level_id | `substitute_rule_configs` with `criteria_key = "exclusion"` |
| Already assigned to this leave | u is already assigned as substitute to another session in the same leave request L | In-memory dedup per L |

Preference rules are soft ranking inputs unless marked as hard constraints:
- Preferred substitute: add configured boost after feasibility filtering.
- Excluded substitute: filter out as hard constraint by default.
- Direct assignment by admin: allowed as manual override only when not blocked by hard safety constraints.

Assignment lifecycle states:
- `unfilled`: coverage is required but no substitute is assigned.
- `assigned`: admin confirmed a substitute; no substitute response required.
- `offered`: admin/system offered a job and waits for response, if offer flow is approved.
- `accepted` / `declined`: substitute response states, if offer flow is approved.
- `acknowledged`: substitute viewed/acknowledged an admin-confirmed assignment.
- `completed`: admin confirms coverage was fulfilled.
- `canceled`: leave or assignment was canceled; record remains auditable.

Infeasible candidates are filtered **before** scoring. They do not appear in the ranked list.

**Phase 2 — Multi-Criteria Scoring**
For each feasible candidate u, compute normalized sub-scores in the range [0, 1]. Every sub-score must be deterministic, clamped to [0, 1], and returned in the API breakdown. Hard eligibility rules stay in Phase 1; Phase 2 only ranks feasible candidates.

#### Exact Numeric Rules and Rounding
- Internal ranking uses full JavaScript `number` precision.
- Display and API examples round to 4 decimals for formulas and 2 decimals for human UI labels.
- Every final sub-score must be clamped to [0, 1]. If an input is missing, use the documented default for that criterion.
- All examples below use the same three feasible candidates for a Math Grade 4A session on 2026-05-04.

Example candidate dataset used by this section:

| Candidate | Term sub units | Week sub units | Capacity | Subject competency | Grade match | Credential | Exact class count / last | Section count / last | Subject-grade count / last | Days since last sub | Preference rule |
|---|---:|---:|---:|---|---|---|---|---|---|---:|---|
| Teacher A | 2 | 0 | 1.0 | secondary | same | not required | 0 / none | 2 / 1 term ago | 1 / 1 term ago | never | none |
| Teacher B | 4 | 1 | 1.0 | primary | same | present | 0 / none | 0 / none | 0 / none | 7 | exact preferred |
| Teacher C | 6 | 2 | 1.0 | capable | adjacent | missing preferred | 5 / 0 terms ago | 4 / 0 terms ago | 3 / 0 terms ago | 16 | soft avoid |

#### Shared Scoring Helpers
These helpers are not conceptual; implement them exactly in the scoring module.

```typescript
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function minMaxInvert(value: number, min: number, max: number): number {
  // Use when LOWER raw values should receive HIGHER normalized scores.
  // Step 1: compute range = max - min.
  // Step 2: if range is 0, all candidates are tied, so return 1.
  // Step 3: compute position = (value - min) / range.
  //         position is 0 for the lowest raw value and 1 for the highest raw value.
  // Step 4: invert because lower is better: inverted = 1 - position.
  // Step 5: clamp to [0, 1] to protect against floating-point or bad inputs.
  const range = max - min;
  if (range === 0) return 1;
  const position = (value - min) / range;
  return clamp01(1 - position);
}

function saturatingCount(count: number, halfSaturationCount: number): number {
  // Converts counts into a 0..1 signal with diminishing returns.
  // Formula: count / (count + halfSaturationCount)
  // If count = 0 and half = 2: 0 / (0 + 2) = 0
  // If count = half: half / (half + half) = 0.5
  // If count is large: value approaches 1 but never exceeds 1
  if (count <= 0) return 0;
  return clamp01(count / (count + halfSaturationCount));
}

function expDecay(termsAgo: number, halfLifeTerms: number): number {
  // Half-life decay. With halfLifeTerms=3:
  // termsAgo=0 => 1.0000; termsAgo=3 => 0.5000; termsAgo=6 => 0.2500
  const lambda = Math.log(2) / halfLifeTerms;
  return Math.exp(-lambda * Math.max(0, termsAgo));
}
```

Scoring data window defaults:
- `term_window`: active school term.
- `week_window`: Monday-Sunday school week containing D.
- `recency_window_days`: default 14.
- `standard_period_minutes`: default 45 if the timetable period does not store duration.
- Assignment statuses counted as workload: `assigned`, `acknowledged`, `accepted`, `completed`; exclude `declined`, `canceled`, `unfilled`.

#### Criterion A: Workload Balance (`score_A`)
Goal: prefer candidates who have carried less substitute burden, adjusted for recent week load and optional capacity. Lower workload is better.

Implementation formula:

```
period_units(assignment) = max(1, assignment.duration_minutes / standard_period_minutes)
term_sub_units(u)        = sum period_units for u's counted assignments in current term
week_sub_units(u)        = sum period_units for u's counted assignments in current week
capacity_factor(u)       = configured capacity, default 1.0
adjusted_term_load(u)    = term_sub_units(u) / capacity_factor(u)
adjusted_week_load(u)    = week_sub_units(u) / capacity_factor(u)
raw_workload(u)          = adjusted_term_load(u) + (week_pressure_weight * adjusted_week_load(u))
min_load                 = min raw_workload(v) across feasible candidates
max_load                 = max raw_workload(v) across feasible candidates
score_A(u)               = minMaxInvert(raw_workload(u), min_load, max_load)
```

Default `week_pressure_weight = 0.50`.

Step-by-step example:

1. Compute adjusted term and week loads.
   - Teacher A: `adjusted_term_load = 2 / 1.0 = 2`; `adjusted_week_load = 0 / 1.0 = 0`
   - Teacher B: `adjusted_term_load = 4 / 1.0 = 4`; `adjusted_week_load = 1 / 1.0 = 1`
   - Teacher C: `adjusted_term_load = 6 / 1.0 = 6`; `adjusted_week_load = 2 / 1.0 = 2`
2. Compute raw workload using `week_pressure_weight = 0.50`.
   - Teacher A: `raw_workload = 2 + (0.50 * 0) = 2.0`
   - Teacher B: `raw_workload = 4 + (0.50 * 1) = 4.5`
   - Teacher C: `raw_workload = 6 + (0.50 * 2) = 7.0`
3. Compute min and max.
   - `min_load = min(2.0, 4.5, 7.0) = 2.0`
   - `max_load = max(2.0, 4.5, 7.0) = 7.0`
   - `range = max_load - min_load = 7.0 - 2.0 = 5.0`
4. Apply `minMaxInvert` for each candidate.
   - Teacher A: `position = (2.0 - 2.0) / 5.0 = 0`; `score_A = 1 - 0 = 1.0000`
   - Teacher B: `position = (4.5 - 2.0) / 5.0 = 0.5000`; `score_A = 1 - 0.5000 = 0.5000`
   - Teacher C: `position = (7.0 - 2.0) / 5.0 = 1.0000`; `score_A = 1 - 1.0000 = 0.0000`

Summary:

| Candidate | Raw workload | minMaxInvert calculation | score_A |
|---|---:|---|---:|
| Teacher A | 2.0 | `1 - ((2.0 - 2.0) / 5.0)` | 1.0000 |
| Teacher B | 4.5 | `1 - ((4.5 - 2.0) / 5.0)` | 0.5000 |
| Teacher C | 7.0 | `1 - ((7.0 - 2.0) / 5.0)` | 0.0000 |

#### Criterion B: Subject Competency / Qualification (`score_B`)
Goal: prefer candidates who can teach the subject and grade level well. If the school marks competency as a hard requirement, insufficient candidates are filtered in Phase 1; otherwise competency contributes to rank.

Implementation formula:

```
base_subject_score = configured score for candidate's best competency match
if no exact subject record and same-department mapping exists:
    base_subject_score = same_department_score

grade_multiplier = configured multiplier for candidate's grade/program match
credential_bonus = 0.10 if credential is preferred and present, else 0.00
credential_penalty = 0.20 if credential is preferred and missing, else 0.00
score_B = clamp01((base_subject_score * grade_multiplier) + credential_bonus - credential_penalty)
```

Default base subject scores:

| Competency source | Default base score |
|---|---:|
| Exact subject, `primary` | 1.00 |
| Exact subject, `secondary` | 0.75 |
| Exact subject, `capable` | 0.45 |
| Same department/learning area | 0.30 |
| No matching competency | 0.00 |

Default grade/program multipliers:

| Match | Default multiplier |
|---|---:|
| Same grade band/program | 1.00 |
| Adjacent grade band | 0.85 |
| Different grade band but school allows coverage | 0.70 |
| Restricted program mismatch | Phase 1 hard filter |

Step-by-step example:

1. Teacher A has `secondary` Math competency, same grade band, no credential required.
   - `base_subject_score = 0.75`
   - `grade_multiplier = 1.00`
   - `credential_bonus = 0.00`
   - `credential_penalty = 0.00`
   - `score_B = clamp01((0.75 * 1.00) + 0.00 - 0.00) = 0.7500`
2. Teacher B has `primary` Math competency, same grade band, preferred credential present.
   - `base_subject_score = 1.00`
   - `grade_multiplier = 1.00`
   - `credential_bonus = 0.10`
   - `credential_penalty = 0.00`
   - `raw = (1.00 * 1.00) + 0.10 = 1.10`
   - `score_B = clamp01(1.10) = 1.0000`
3. Teacher C has `capable` Math competency, adjacent grade band, preferred credential missing.
   - `base_subject_score = 0.45`
   - `grade_multiplier = 0.85`
   - `credential_bonus = 0.00`
   - `credential_penalty = 0.20`
   - `raw = (0.45 * 0.85) - 0.20 = 0.3825 - 0.20 = 0.1825`
   - `score_B = clamp01(0.1825) = 0.1825`

Summary:

| Candidate | Calculation | score_B |
|---|---|---:|
| Teacher A | `(0.75 * 1.00) + 0.00 - 0.00` | 0.7500 |
| Teacher B | `clamp01((1.00 * 1.00) + 0.10)` | 1.0000 |
| Teacher C | `(0.45 * 0.85) + 0.00 - 0.20` | 0.1825 |

#### Criterion C: Class Familiarity (`score_C`)
Goal: prefer candidates already familiar with the class, students, grade section, or learning context.

Implementation formula:

```
decay(terms_ago) = expDecay(terms_ago, halfLifeTerms = 3)
exact_signal = saturatingCount(exact_count, 2) * decay(terms_since_last_exact)
section_signal = 0.75 * saturatingCount(section_count, 3) * decay(terms_since_last_section)
subject_grade_signal = 0.60 * saturatingCount(subject_grade_count, 3) * decay(terms_since_last_subject_grade)
derived_familiarity = max(exact_signal, section_signal, subject_grade_signal)
manual_familiarity = teacher_class_familiarities.familiarity_score if present, else 0
score_C = clamp01(max(manual_familiarity, derived_familiarity))
```

Exact implementation of `saturatingCount`:
- Formula: `count / (count + halfSaturationCount)`.
- With `halfSaturationCount = 2`, count 2 gives `2 / (2 + 2) = 0.5000`.
- With `halfSaturationCount = 3`, count 3 gives `3 / (3 + 3) = 0.5000`.

Exact implementation of decay:
- Formula: `exp(-(ln(2) / 3) * terms_ago)`.
- `terms_ago = 0`: `exp(0) = 1.0000`.
- `terms_ago = 1`: `exp(-0.2310 * 1) = 0.7937`.
- `terms_ago = 3`: `exp(-0.6931) = 0.5000`.

Step-by-step example:

1. Teacher A has no exact class history, 2 same-section records 1 term ago, and 1 same subject-grade record 1 term ago.
   - Exact: `exact_count = 0`; `exact_signal = 0`
   - Section count signal: `saturatingCount(2, 3) = 2 / (2 + 3) = 0.4000`
   - Section decay: `exp(-(ln(2)/3) * 1) = 0.7937`
   - `section_signal = 0.75 * 0.4000 * 0.7937 = 0.2381`
   - Subject-grade count signal: `saturatingCount(1, 3) = 1 / (1 + 3) = 0.2500`
   - Subject-grade decay: `0.7937`
   - `subject_grade_signal = 0.60 * 0.2500 * 0.7937 = 0.1191`
   - `score_C = max(0, 0.2381, 0.1191) = 0.2381`
2. Teacher B has no familiarity records.
   - `exact_signal = 0`; `section_signal = 0`; `subject_grade_signal = 0`
   - `score_C = 0.0000`
3. Teacher C has 5 exact class records this term, 4 section records this term, and 3 subject-grade records this term.
   - Exact count signal: `saturatingCount(5, 2) = 5 / (5 + 2) = 0.7143`
   - Exact decay: `exp(0) = 1.0000`
   - `exact_signal = 0.7143 * 1.0000 = 0.7143`
   - Section signal: `0.75 * (4 / (4 + 3)) * 1.0000 = 0.75 * 0.5714 = 0.4286`
   - Subject-grade signal: `0.60 * (3 / (3 + 3)) * 1.0000 = 0.60 * 0.5000 = 0.3000`
   - `score_C = max(0.7143, 0.4286, 0.3000) = 0.7143`

Summary:

| Candidate | exact_signal | section_signal | subject_grade_signal | score_C |
|---|---:|---:|---:|---:|
| Teacher A | 0.0000 | 0.2381 | 0.1191 | 0.2381 |
| Teacher B | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Teacher C | 0.7143 | 0.4286 | 0.3000 | 0.7143 |

#### Criterion D: Recency / Rotation Protection (`score_D`)
Goal: avoid repeatedly choosing the same teacher in a short period.

Implementation formula:

```
if no previous substitute assignment:
    score_D = 1.0
else if days_since_last_sub >= recency_window_days:
    score_D = 1.0
else if recency_penalty_shape == "linear":
    score_D = clamp01(days_since_last_sub / recency_window_days)
else if recency_penalty_shape == "exponential":
    tau = recency_window_days / 3
    score_D = clamp01(1.0 - exp(-days_since_last_sub / tau))
```

Default `recency_window_days = 14` and `recency_penalty_shape = linear`.

Step-by-step linear example:

1. Teacher A has never substituted.
   - `score_D = 1.0000`
2. Teacher B last substituted 7 days ago.
   - `score_D = 7 / 14 = 0.5000`
3. Teacher C last substituted 16 days ago.
   - `16 >= 14`, so `score_D = 1.0000`

If exponential mode is enabled for Teacher B:
- `tau = 14 / 3 = 4.6667`
- `score_D = 1 - exp(-7 / 4.6667)`
- `score_D = 1 - exp(-1.5000)`
- `score_D = 1 - 0.2231 = 0.7769`

Summary:

| Candidate | days_since_last_sub | Linear calculation | score_D |
|---|---:|---|---:|
| Teacher A | null | never substituted | 1.0000 |
| Teacher B | 7 | `7 / 14` | 0.5000 |
| Teacher C | 16 | `>= 14` | 1.0000 |

#### Criterion E: Preference / Policy Fit (`score_E`)
Goal: rank preferred candidates higher without confusing hard exclusions and soft preferences.

Implementation formula:

```
base_preference = custom_params.neutral ?? 0.50
preferred_boost = max boost from matching soft preferred rules, default 0.30
soft_penalty = max penalty from matching soft avoid rules, default 0.30
score_E = clamp01(base_preference + preferred_boost - soft_penalty)
```

Matching precedence from strongest to weakest:
1. Exact schedule_session preference/exclusion.
2. Original teacher preference/exclusion.
3. Subject + grade preference/exclusion.
4. Subject-only preference/exclusion.
5. School-wide preference/exclusion.

Rule selection algorithm:

```typescript
function pickPreferenceEffect(rules: PreferenceRule[], context: SessionContext): PreferenceEffect {
  const matching = rules.filter(rule => ruleMatches(rule, context));
  if (matching.some(rule => rule.mode === "hard_exclude")) return { hardExcluded: true };

  const preferredBoost = Math.max(0, ...matching
    .filter(rule => rule.mode === "soft_prefer")
    .map(rule => rule.weight ?? 0.30));

  const softPenalty = Math.max(0, ...matching
    .filter(rule => rule.mode === "soft_avoid")
    .map(rule => rule.weight ?? 0.30));

  return { hardExcluded: false, preferredBoost, softPenalty, ruleIds: matching.map(rule => rule.id) };
}
```

Step-by-step example:

1. Teacher A has no matching preference rules.
   - `base_preference = 0.50`
   - `preferred_boost = 0.00`
   - `soft_penalty = 0.00`
   - `score_E = clamp01(0.50 + 0.00 - 0.00) = 0.5000`
2. Teacher B has exact preferred rule with default boost 0.30.
   - `base_preference = 0.50`
   - `preferred_boost = 0.30`
   - `soft_penalty = 0.00`
   - `score_E = clamp01(0.50 + 0.30 - 0.00) = 0.8000`
3. Teacher C has soft avoid rule with default penalty 0.30.
   - `base_preference = 0.50`
   - `preferred_boost = 0.00`
   - `soft_penalty = 0.30`
   - `score_E = clamp01(0.50 + 0.00 - 0.30) = 0.2000`

Summary:

| Candidate | Preference calculation | score_E |
|---|---|---:|
| Teacher A | `0.50 + 0.00 - 0.00` | 0.5000 |
| Teacher B | `0.50 + 0.30 - 0.00` | 0.8000 |
| Teacher C | `0.50 + 0.00 - 0.30` | 0.2000 |

#### Phase 2 Output for the Example Candidates

| Candidate | score_A | score_B | score_C | score_D | score_E |
|---|---:|---:|---:|---:|---:|
| Teacher A | 1.0000 | 0.7500 | 0.2381 | 1.0000 | 0.5000 |
| Teacher B | 0.5000 | 1.0000 | 0.0000 | 0.5000 | 0.8000 |
| Teacher C | 0.0000 | 0.1825 | 0.7143 | 1.0000 | 0.2000 |

#### Score Rounding and Audit Values
Persist or return these values for explainability:

```
raw_inputs: term_sub_units, week_sub_units, capacity_factor, raw_workload,
            competency_level, grade_multiplier, credential_bonus, credential_penalty,
            familiarity_signals, days_since_last_sub, preference_rule_ids
sub_scores: score_A, score_B, score_C, score_D, score_E
```

For display, round scores to two decimals. For ranking, keep full precision and round only after sorting.

### Phase 3 — Composite Score and Ranking

**Weighted Composite Formula**

Implementation formula:

```
enabled_criteria = criteria where enabled == true and weight > 0
weight_sum = sum(weight_i for enabled_criteria)
normalized_weight_i = weight_i / weight_sum
contribution_i(u) = normalized_weight_i * score_i(u)
composite_score(u) = sum(contribution_i(u) for enabled_criteria)
```

If `weight_sum == 0`, reject the rule configuration before scoring. Disabled criteria have normalized weight 0 and contribution 0. Preference/policy fit (E) can be enabled only when the school has configured soft preference rules; hard exclusions remain Phase 1 filters.

**Default weights** (configurable per school):
| Criterion | Default weight | Rationale |
|---|---:|---|
| Workload Balance (A) | 0.30 | Fairness is important but not absolute |
| Subject Competency (B) | 0.35 | Instructional quality is highest priority |
| Class Familiarity (C) | 0.20 | Student continuity matters |
| Recency Penalty (D) | 0.15 | Prevents repetitive burden |
| Preference / Policy Fit (E) | 0.00 disabled by default | Only affects rank when school configures soft preference rules |

#### Step-by-Step Composite Example: E Disabled
With default A-D weights and E disabled, `weight_sum = 0.30 + 0.35 + 0.20 + 0.15 = 1.00`, so normalized weights equal defaults.

Teacher A:
1. Workload contribution: `0.30 * 1.0000 = 0.3000`
2. Competency contribution: `0.35 * 0.7500 = 0.2625`
3. Familiarity contribution: `0.20 * 0.2381 = 0.0476`
4. Recency contribution: `0.15 * 1.0000 = 0.1500`
5. Composite: `0.3000 + 0.2625 + 0.0476 + 0.1500 = 0.7601`

Teacher B:
1. Workload contribution: `0.30 * 0.5000 = 0.1500`
2. Competency contribution: `0.35 * 1.0000 = 0.3500`
3. Familiarity contribution: `0.20 * 0.0000 = 0.0000`
4. Recency contribution: `0.15 * 0.5000 = 0.0750`
5. Composite: `0.1500 + 0.3500 + 0.0000 + 0.0750 = 0.5750`

Teacher C:
1. Workload contribution: `0.30 * 0.0000 = 0.0000`
2. Competency contribution: `0.35 * 0.1825 = 0.0639`
3. Familiarity contribution: `0.20 * 0.7143 = 0.1429`
4. Recency contribution: `0.15 * 1.0000 = 0.1500`
5. Composite: `0.0000 + 0.0639 + 0.1429 + 0.1500 = 0.3568`

Summary:

| Candidate | A contribution | B contribution | C contribution | D contribution | Composite | Rank |
|---|---:|---:|---:|---:|---:|---:|
| Teacher A | 0.3000 | 0.2625 | 0.0476 | 0.1500 | 0.7601 | 1 |
| Teacher B | 0.1500 | 0.3500 | 0.0000 | 0.0750 | 0.5750 | 2 |
| Teacher C | 0.0000 | 0.0639 | 0.1429 | 0.1500 | 0.3568 | 3 |

#### Step-by-Step Composite Example: E Enabled
If the school enables preference/policy with raw weight `0.10`, raw weights are A=0.30, B=0.35, C=0.20, D=0.15, E=0.10.

1. Compute raw weight sum: `0.30 + 0.35 + 0.20 + 0.15 + 0.10 = 1.10`.
2. Normalize weights:
   - `A = 0.30 / 1.10 = 0.2727`
   - `B = 0.35 / 1.10 = 0.3182`
   - `C = 0.20 / 1.10 = 0.1818`
   - `D = 0.15 / 1.10 = 0.1364`
   - `E = 0.10 / 1.10 = 0.0909`
3. Calculate contributions.

Teacher A:
- A: `0.2727 * 1.0000 = 0.2727`
- B: `0.3182 * 0.7500 = 0.2387`
- C: `0.1818 * 0.2381 = 0.0433`
- D: `0.1364 * 1.0000 = 0.1364`
- E: `0.0909 * 0.5000 = 0.0455`
- Composite: `0.2727 + 0.2387 + 0.0433 + 0.1364 + 0.0455 = 0.7366`

Teacher B:
- A: `0.2727 * 0.5000 = 0.1364`
- B: `0.3182 * 1.0000 = 0.3182`
- C: `0.1818 * 0.0000 = 0.0000`
- D: `0.1364 * 0.5000 = 0.0682`
- E: `0.0909 * 0.8000 = 0.0727`
- Composite: `0.1364 + 0.3182 + 0.0000 + 0.0682 + 0.0727 = 0.5955`

Teacher C:
- A: `0.2727 * 0.0000 = 0.0000`
- B: `0.3182 * 0.1825 = 0.0581`
- C: `0.1818 * 0.7143 = 0.1299`
- D: `0.1364 * 1.0000 = 0.1364`
- E: `0.0909 * 0.2000 = 0.0182`
- Composite: `0.0000 + 0.0581 + 0.1299 + 0.1364 + 0.0182 = 0.3426`

Summary with E enabled:

| Candidate | A | B | C | D | E | Composite | Rank |
|---|---:|---:|---:|---:|---:|---:|---:|
| Teacher A | 0.2727 | 0.2387 | 0.0433 | 0.1364 | 0.0455 | 0.7366 | 1 |
| Teacher B | 0.1364 | 0.3182 | 0.0000 | 0.0682 | 0.0727 | 0.5955 | 2 |
| Teacher C | 0.0000 | 0.0581 | 0.1299 | 0.1364 | 0.0182 | 0.3426 | 3 |

**Tie-Breaking**
If `composite_score` ties within ε = 0.001:
1. Prefer lower `raw_workload(u)`.
2. Prefer higher `score_B(u)`.
3. Prefer higher `score_C(u)`.
4. Prefer candidate with lower stable `teacher_id` lexicographically for deterministic output.

**No Feasible Candidates**
If Phase 1 yields zero feasible candidates for session s:
- Return empty ranked list with a structured reason code: `NO_AVAILABLE_SUBSTITUTE`.
- UI shows: "No available teachers — mark unfilled, adjust filters, or choose manual override."
- Audit event is written noting the uncovered session.

**Recommendation Runtime UX Contract**
The algorithm should be fast for normal MVP scale, but the product SLA prioritizes explainable quality over a hard 2-second response.
- If recommendation can complete quickly, `API-012` may return the ranked list synchronously.
- If calculation is not complete within the API's short request budget, `API-012` returns a `job_id` and initial status `running`.
- UI polls `API-031` for `queued` / `running` / `completed` / `failed` status and displays elapsed time, current step, and safe fallback actions.
- The user-facing maximum target is 2 minutes for up to 100 teachers. After 2 minutes, UI should show retry, manual assignment, or mark-unfilled options.
- Long-running jobs must be idempotent by `(leave_id, session_id, rule_config_version)` so refresh/retry does not duplicate work.

### Fairness Metrics

The algorithm is not merely a ranking function; it must produce **fair outcomes** over time. Define:

**Term Fairness Index (TFI)** — measured weekly by report service:
```
TFI = 1 - (σ / μ)
where:
  μ = mean substitute count per teacher this term
  σ = standard deviation of substitute counts
```

- TFI = 1.0 → perfect equality (all teachers have identical counts)
- TFI = 0.0 → maximum inequality (one teacher has all substitutions)
- Target for MVP: TFI ≥ 0.80 after 4+ weeks of term data

**Coverage Rate** — percentage of leave-affected sessions with an assigned substitute:
```
coverage_rate = assigned_sessions / total_affected_sessions
```
- Target: ≥ 95% for coverage-required leave impacts (some sessions may legitimately have no feasible sub)

### Explainability Contract (API Response)

`GET /roster/substitutes/recommend` must return, for each candidate:

```typescript
type SubstituteRecommendation = {
  teacher_id: string;
  teacher_name: string;
  composite_score: number;        // 0.0 - 1.0
  rank: number;
  is_feasible: boolean;           // always true in ranked list
  breakdown: {
    workload_balance:  { score: number; weight: number; contribution: number; detail: string };
    subject_competency: { score: number; weight: number; contribution: number; detail: string };
    class_familiarity:  { score: number; weight: number; contribution: number; detail: string };
    recency_penalty:    { score: number; weight: number; contribution: number; detail: string };
    preference_policy:  { score: number; weight: number; contribution: number; detail: string; rule_ids: string[] };
  };
  raw_inputs: {
    term_sub_units: number;
    week_sub_units: number;
    capacity_factor: number;
    raw_workload: number;
    competency_level: string | null;
    grade_multiplier: number;
    credential_bonus: number;
    credential_penalty: number;
    days_since_last_sub: number | null;
    familiarity_signals: Record<string, number>;
    preference_rule_ids: string[];
  };
  reason_codes: string[];         // e.g., ["PRIMARY_SUBJECT_MATCH", "LOW_WORKLOAD"]
};
```

- `contribution` = `score * normalized_weight` (shows how much each criterion contributed to the composite)
- `detail` = human-readable string: "2.0 term units, 0 this week" or "Primary subject: Mathematics"
- `raw_inputs` = non-sensitive scoring inputs needed to debug or audit the recommendation; do not include private leave reason text
- `reason_codes` = machine-readable tags for UI badges

### Configuration Model

Per-school rule configuration stored in `substitute_rule_configs`:

| `criteria_key` | `weight` | `enabled` | `custom_params` (JSONB) |
|---|---|---|---|
| `workload_balance` | 0.30 | true | `{ "target_distribution": "mean" }` |
| `subject_competency` | 0.35 | true | `{ "primary": 1.0, "secondary": 0.75, "capable": 0.45, "same_department": 0.30, "none": 0.0 }` |
| `class_familiarity` | 0.20 | true | `{ "decay_half_life_terms": 3 }` |
| `recency_penalty` | 0.15 | true | `{ "window_days": 14, "shape": "linear" }` |
| `preference_policy` | 0.10 | true | `{ "neutral": 0.5, "preferred_boost": 0.3, "soft_penalty": 0.3, "scopes": ["schedule_session", "original_teacher", "subject_grade", "subject", "teacher", "school"] }` |
| `weekly_substitute_cap` | — | true | `{ "max_per_week": 5 }` |
| `hard_constraints` | — | true | `{ "require_competency": false, "require_availability": true }` |
| `exclusion` | — | true | `{ "teacher_ids": [], "subject_ids": [], "grade_level_ids": [] }` |

Constraints on configuration:
- Enabled scoring weights may be stored as configured raw weights; scoring normalizes them at runtime so enabled weights sum to 1.0
- All scoring weights must be in [0, 1]
- At least one scoring criterion with weight > 0 must be enabled
- Hard-constraint rows do not participate in the composite score weight sum
- `weekly_substitute_cap` must be ≥ 1

### Performance Characteristics

For school scale: ~100 teachers, ~5-10 leave events/day, ~3-5 affected sessions per leave.

| Phase | Complexity | Expected Time | Notes |
|---|---|---|---|
| Feasibility | O(n) per session | <10ms | Single query with JOINs |
| Workload aggregation | O(n) | <20ms | Cached in-memory per request |
| Scoring (all criteria) | O(n) per session | <30ms | Pure arithmetic per candidate |
| Ranking | O(n log n) per session | <10ms | Sort ≤100 items |
| **Total per session** | **O(n log n)** | **<100ms typical** | Should usually return synchronously at MVP scale |
| **Total per leave (5 sessions)** | — | **<500ms** | Parallelizable per session |

Cache strategy:
- `term_sub_units(u)` and `week_sub_units(u)`: computed once per recommendation request, held in memory
- `teacher_competencies`, `teacher_class_familiarities`, `substitute_availabilities`, and preference/exclusion rules: fetched once per request
- No Redis required for MVP; in-memory per request is sufficient at this scale

### Testing Strategy

**Unit Tests — Scoring Engine**
- Test each criterion in isolation with controlled inputs, including workload min/max normalization, competency multipliers, familiarity decay, recency recovery, and preference boosts/penalties
- Test boundary conditions: zero candidates, one candidate, all identical scores
- Test tie-breaking determinism
- Test weight changes: if w_B is set to 1.0 and others to 0.0, ranking must exactly follow competency tiers
- Test configuration validation: reject negative weights, weights > 1.0, and configs with no enabled criterion whose weight is > 0

**Unit Tests — Feasibility Filter**
- Teacher already teaching at same period → excluded
- Teacher on leave → excluded
- Teacher at weekly cap → excluded
- Teacher excluded by subject → excluded

**Integration Tests — End-to-End Recommendation**
- Given a seed database with 10 teachers, 20 sessions, 3 competency records, 2 familiarity records
- Apply leave for a math session
- Verify ranked order matches expected composite scores
- Verify score breakdown sums correctly

**Fairness Regression Tests**
- Simulate 50 random leave events across a term
- Assert TFI ≥ 0.80
- Assert no teacher receives >2× average substitute count

### Migration Path: Weighted Scoring → CP-SAT (Future)

The weighted scoring approach is appropriate for MVP because:
1. It is explainable, testable, and fast
2. It does not require external solver dependencies
3. It supports human-in-the-loop (admin override) naturally

If future requirements demand **auto-assignment** or **global optimization** (e.g., assign substitutes for an entire week simultaneously to maximize total composite score across all sessions), the architecture can migrate to **Google OR-Tools CP-SAT**:

```
Current:   Per-session greedy ranking (fast, explainable)
Future:    Global CP-SAT model with:
           - Decision variables: x_{u,s} ∈ {0,1} (teacher u assigned to session s)
           - Hard constraints: availability, caps, exclusions
           - Soft objective: maximize Σ composite_score(u,s) * x_{u,s}
           - Time limit: 5s, return best feasible solution
```

Migration checklist (for future spike):
1. Add `ortools` dependency to backend
2. Build CP-SAT model generator from existing feasibility + scoring logic
3. A/B test: weighted scoring vs CP-SAT on historical leave data
4. Preserve explainability: CP-SAT objective value maps back to composite_score

## Error Handling And Observability [AIH]
- User-facing errors: Localized, actionable messages. Schedule conflicts show exactly which teacher/room is double-booked.
- Server/API errors: Structured error with code, message key, and safe params for localization.
- Integration failures: Steck service unreachable → return 503 with retry guidance; local log for ops.
- Logging: Structured request logs; algorithm decision logs at debug level.
- Metrics/tracing: Request latency for substitute recommendation; leave application rate; assignment rate.
- Debuggability expectations: Algorithm scores must be explainable (log or return score breakdown).

## Performance And Scalability [AIH]
- Expected usage/scale: 100 teachers, 50 classes, ~30 sessions per week per class = ~1500 sessions/week. Leave events: ~5-10/day.
- Critical performance paths: Substitute recommendation should complete quickly for common cases and within 2 minutes for up to 100 teachers with visible job status/progress if not immediate.
- Caching strategy: Teacher workload per term can be cached briefly (Redis or in-memory) during recommendation.
- Pagination/streaming/batching: Session lists paginated; report queries server-side paginated.
- Known limits: Scoring is O(n) per session; ranking is O(n log n) per session where n = teacher count. Typical total per-leave recommendation should be seconds or less at MVP scale, but UX/API must support an async job status path up to the 2-minute user-facing target. See "Substitute Matching Algorithm Specification" for exact performance model.

## Technical Decisions Needing Approval [AIH]
| Decision | Options | Recommendation | Impact | Approval status |
|---|---|---|---|---|
| Cache for workload aggregation | In-memory per request vs Redis | In-memory per request first | Simpler; can add Redis later | Needs human review |
| Schedule UI interaction | Grid click-to-assign vs drag-and-drop | Grid click-to-assign first | Faster to build; DnD can enhance later | Needs human review |
| Competency/familiarity data entry | Manual admin UI vs import from existing Steck data | Manual UI first, import later | Matches MVP scope | Needs human review |
| Leave granularity | Full-day only vs full-day + AM/PM half-day vs arbitrary session selection | Full-day + AM/PM half-day approved for MVP; arbitrary teacher-selected sessions remain future | Corrects earlier human oversight while avoiding full period-by-period leave workflow complexity | Accepted |
| Substitute response model | Admin-confirmed only vs offer/accept/decline | Include offer/accept/decline in MVP | Human approved accept/decline; adds state machine and notification requirements | Accepted |
| Availability ownership | Admin-managed only vs teacher self-service | Teacher self-service availability in MVP | Human approved; recommendations must consume teacher availability | Accepted |
| Preference/exclusion rules | Hard exclusions + preferred boost vs richer scoped rule matrix | Richer scoped preference/exclusion rules in MVP | Human approved; supports class, original teacher, subject/grade, subject, teacher, and school-wide scope | Accepted |
| Steck integration timing | Integrate Steck auth/notifications now vs standalone first | Standalone first; integrate toward app readiness/merge | Human approved; reduces early dependency on Steck service shapes while preserving merge path | Accepted |
| PostgreSQL and Steck schema alignment | Prototype-only `roster_*` tables vs Steck-compatible tables now | Use real PostgreSQL now and strictly reuse any existing Steck table/entity as-is; add only new `rostering_*` tables for module-owned concepts | Human clarified backend must be DB-backed and mergeable; current in-memory/prototype tables are no longer sufficient | Accepted |
| Notification provider | Steck service now vs mock/local service first | Mock/local notifications for MVP | Human approved; real Steck notification API deferred | Accepted |
| Calendar/resource ownership | Integrate existing Steck data vs assume none | Own local calendar/resource/equipment data in MVP | Human approved; assume Steck source is unavailable | Accepted |

## System Design Approval Checklist
Before board compilation proceeds, confirm:
- stack and architecture are approved enough for the selected mode
- domain/data model supports all required journeys
- API/contracts have stable IDs where needed
- integrations have failure behavior and real/mocked status
- modules/services are clear enough to create task integration surfaces
- migration/data risks are visible

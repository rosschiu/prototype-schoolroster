# System Design

- Human Action: REVIEW AND CHANGE
- Status: Draft
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
- Backend/API structure: Domain modules: `timetable`, `session`, `leave`, `substitute`, `roster-report`, `rule-config`. Each owns services, routes, and repository logic.
- Data/persistence layer: PostgreSQL. New tables for timetable, sessions, leave requests, substitute assignments, rule configs.
- Background jobs/workers: Leave notification fanout (via Steck notification service); potential async report generation if needed.
- External integrations: Steck auth, users, roles, school membership, notification/email service.
- Shared packages/modules: `packages/contracts` for new API types; `packages/ui` for schedule grid and leave UI components.

## Domain Model [AIH]
| Entity/concept | Description | Key fields | Relationships | Lifecycle notes |
|---|---|---|---|---|
| timetable | Term-level schedule definition (days, periods) | school_id, term_id, days, periods, effective_dates | belongs to school/term | Active per term; one per term typical |
| timetable_period | A single period slot (day, start_time, end_time) | timetable_id, day_index, period_index, start_time, end_time | belongs to timetable | Immutable once sessions reference it |
| class_session | A scheduled teaching occurrence | school_id, term_id, timetable_period_id, subject_id, grade_level_id, section, room, assigned_teacher_id | belongs to timetable_period, subject, teacher | Active/archived per term |
| teacher_roster | Denormalized view of a teacher's sessions | teacher_id, term_id, sessions[] | derived from class_session | Recalculated on schedule publish |
| leave_request | Teacher leave application | teacher_id, school_id, dates, type, reason, status, requested_at | affects class_sessions | Pending → Approved/Rejected |
| leave_session_impact | Mapping of leave to affected sessions | leave_request_id, class_session_id, date | links leave to session | Created when leave is approved |
| substitute_assignment | Record of a substitute covering a session | leave_request_id, class_session_id, original_teacher_id, substitute_teacher_id, assigned_by, assigned_at, status | links leave + session + teachers | Active/Completed/Cancelled |
| substitute_rule_config | School-specific algorithm weights | school_id, criteria_key, weight, enabled, custom_params | belongs to school | Admin-managed |
| teacher_competency | Teacher's subject expertise | teacher_id, subject_id, level (primary/secondary/capable) | links teacher to subject | Admin-managed or imported |
| teacher_class_familiarity | Historical relationship between teacher and class | teacher_id, class_session_id, familiarity_score, last_taught_term | derived + admin editable | Updated each term |
| roster_audit_event | Audit for roster changes | actor_id, action, object_type, object_id, timestamp, school_id, metadata | belongs to school | Append-only |

## Data Model [AIH]
| Table/store/model | Fields | Indexes/constraints | Ownership | Migration notes |
|---|---|---|---|---|
| timetables | id, school_id, term_id, name, days_json, periods_json, status, created_at | UNIQUE(school_id, term_id) | timetable service | New table |
| timetable_periods | id, timetable_id, day_index, period_index, start_time, end_time | UNIQUE(timetable_id, day_index, period_index) | timetable service | New table |
| class_sessions | id, school_id, term_id, timetable_period_id, subject_id, grade_level_id, section, room, assigned_teacher_id, status | school_id + term_id; assigned_teacher_id + timetable_period_id (prevent double-book) | session service | New table |
| leave_requests | id, teacher_id, school_id, start_date, end_date, type, reason, status, reviewed_by, reviewed_at, created_at | school_id + status; teacher_id + start_date | leave service | New table |
| leave_session_impacts | id, leave_request_id, class_session_id, date, status | leave_request_id; class_session_id + date | leave service | New table |
| substitute_assignments | id, leave_request_id, class_session_id, original_teacher_id, substitute_teacher_id, assigned_by, assigned_at, status | school_id (via session); substitute_teacher_id | substitute service | New table |
| substitute_rule_configs | id, school_id, criteria_key, weight, enabled, custom_params, updated_at | UNIQUE(school_id, criteria_key) | rule-config service | New table |
| teacher_competencies | id, teacher_id, subject_id, level, updated_at | UNIQUE(teacher_id, subject_id) | session/roster service | New table |
| teacher_class_familiarities | id, teacher_id, class_session_id, familiarity_score, last_taught_term, updated_at | UNIQUE(teacher_id, class_session_id) | substitute service | New table |
| roster_audit_events | id, actor_id, action, object_type, object_id, school_id, metadata, created_at | school_id + created_at; object_type + object_id | audit service | New table |

## State Management [AIH]
- Client state: React local state + data-fetching helpers. Schedule planner may use optimistic UI for drag-and-drop.
- Server state/cache: Request/refresh model initially. Schedule and leave data are low-frequency update.
- URL state: Filter/sort params for leave list and reports.
- Session/auth state: Steck auth session.
- Offline/local state if any: Draft leave application saved locally before submit (optional).

## API / Contract Inventory [AIH]
Use stable IDs so implementation and validation tasks can map to contracts.

| ID | Surface | Method/event | Input | Output | Errors | Auth |
|---|---|---|---|---|---|---|
| API-001 | /roster/timetables | POST | school_id, term_id, name, days, periods | timetable | validation, conflict | admin |
| API-002 | /roster/timetables/:id | GET | timetable_id | timetable + periods | not_found | admin/teacher |
| API-003 | /roster/timetables/:id/publish | POST | timetable_id | published timetable | not_found, conflict | admin |
| API-004 | /roster/sessions | POST | timetable_period_id, subject_id, grade_level_id, section, room, teacher_id | class_session | validation, double_book | admin |
| API-005 | /roster/sessions/:id | PATCH | session fields | updated session | not_found, conflict | admin |
| API-006 | /roster/sessions/:id | DELETE | session_id | success | not_found | admin |
| API-007 | /roster/teacher-roster | GET | teacher_id, term_id | list of sessions | not_found | teacher (self) / admin |
| API-008 | /roster/leave | POST | dates, type, reason, session_ids (optional) | leave_request | validation | teacher (self) |
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
| API-021 | /roster/familiarities | POST | teacher_id, class_session_id, score | familiarity | validation | admin |

## Integration Inventory [AIH]
| Integration | Purpose | Real/mocked | Auth/secrets | Failure behavior | Validation approach |
|---|---|---|---|---|---|
| Steck auth/session | Authentication and role context | Real | Steck session cookie | Redirect to login | Integration tests |
| Steck users/roles | User identity, role checks, teacher list | Real | Steck internal API | Error if unreachable | Integration tests |
| Steck school/term | School tenancy, academic term data | Real | Steck internal API | Error if unreachable | Integration tests |
| Steck notifications | In-app + email notification for leave and substitute | Real (stub in dev) | Steck notification service | Log and retry | Integration tests |
| Steck audit | Write roster audit events to shared audit system | Real | Steck internal API | Local fallback log | Integration tests |

## Service / Module Boundaries [AIH]
| Module/service | Responsibility | Inputs | Outputs | Used by | Notes |
|---|---|---|---|---|---|
| timetable service | CRUD timetable structure; publish | admin commands | timetable, periods | session service, UI | One per term |
| session service | CRUD class sessions; conflict detection | admin commands, timetable | sessions, roster | leave service, substitute service | Enforces double-book rules |
| leave service | Leave application lifecycle; impact calculation | teacher request, admin command | leave requests, impacts | substitute service, notification | Creates impacts on approval |
| substitute service | Recommendation algorithm; assignment | leave + session + rules | ranked candidates, assignments | UI, notification | Core algorithm module |
| rule-config service | CRUD substitute rule weights | admin commands | rule config | substitute service | Per-school |
| roster-report service | Aggregate workload, leave, substitute data | queries | report data | UI | Read-only aggregates |
| roster-audit service | Write/query roster-specific audit | domain events | audit events | all roster services | Append-only |

## Error Handling And Observability [AIH]
- User-facing errors: Localized, actionable messages. Schedule conflicts show exactly which teacher/room is double-booked.
- Server/API errors: Structured error with code, message key, and safe params for localization.
- Integration failures: Steck service unreachable → return 503 with retry guidance; local log for ops.
- Logging: Structured request logs; algorithm decision logs at debug level.
- Metrics/tracing: Request latency for substitute recommendation; leave application rate; assignment rate.
- Debuggability expectations: Algorithm scores must be explainable (log or return score breakdown).

## Performance And Scalability [AIH]
- Expected usage/scale: 100 teachers, 50 classes, ~30 sessions per week per class = ~1500 sessions/week. Leave events: ~5-10/day.
- Critical performance paths: Substitute recommendation query must complete in <2s for 100 teachers.
- Caching strategy: Teacher workload per term can be cached briefly (Redis or in-memory) during recommendation.
- Pagination/streaming/batching: Session lists paginated; report queries server-side paginated.
- Known limits: Algorithm is O(n) per candidate where n = sessions per term; acceptable for MVP scale.

## Technical Decisions Needing Approval [AIH]
| Decision | Options | Recommendation | Impact | Approval status |
|---|---|---|---|---|
| Cache for workload aggregation | In-memory per request vs Redis | In-memory per request first | Simpler; can add Redis later | Needs human review |
| Schedule UI interaction | Grid click-to-assign vs drag-and-drop | Grid click-to-assign first | Faster to build; DnD can enhance later | Needs human review |
| Competency/familiarity data entry | Manual admin UI vs import from existing Steck data | Manual UI first, import later | Matches MVP scope | Needs human review |

## System Design Approval Checklist
Before board compilation proceeds, confirm:
- stack and architecture are approved enough for the selected mode
- domain/data model supports all required journeys
- API/contracts have stable IDs where needed
- integrations have failure behavior and real/mocked status
- modules/services are clear enough to create task integration surfaces
- migration/data risks are visible

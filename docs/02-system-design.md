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

## Substitute Matching Algorithm Specification [AIH]

### Purpose
Formalize the multi-criteria scoring methodology for the substitute teacher recommendation engine. This section replaces the hand-wavy "algorithm is O(n) per candidate" placeholder with exact formulas, normalization strategy, fairness metrics, explainability contract, and testing strategy.

### Problem Formalization
Given:
- A `leave_request` L submitted by teacher T_leave for date D
- The set of `class_session` objects S = {s₁, s₂, ... sₖ} affected by L on D
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
| Double-booked | u already has a `class_session` at the same `timetable_period` as s on D | Session query |
| On leave | u has an approved `leave_request` covering D | Leave query |
| Weekly cap exceeded | u's substitute_assignment count for the current week ≥ `weekly_substitute_cap` (configurable, default 5) | Aggregate query on `substitute_assignments` |
| Excluded | u is in school-configured exclusion list for s.subject_id or s.grade_level_id | `substitute_rule_configs` with `criteria_key = "exclusion"` |
| Already assigned to this leave | u is already assigned as substitute to another session in the same leave request L | In-memory dedup per L |

Infeasible candidates are filtered **before** scoring. They do not appear in the ranked list.

**Phase 2 — Multi-Criteria Scoring**
For each feasible candidate u, compute four normalized sub-scores in the range [0, 1]:

#### Criterion A: Workload Balance (`score_A`)
Measures how far u's current substitute burden is from the ideal fair share.

```
let sub_count(u)  = count of substitute_assignments for u in current term
let avg_sub       = mean sub_count across all feasible candidates for this session
let max_dev       = max |sub_count(v) - avg_sub| across all feasible candidates v

if max_dev == 0:
    score_A(u) = 1.0
else:
    deviation    = |sub_count(u) - avg_sub|
    score_A(u)   = 1.0 - (deviation / max_dev)
```

Properties:
- Teachers with exactly average workload score 1.0
- The teacher with the highest deviation scores 0.0
- Negative deviation (below average) is rewarded the same as exact average → `score_A = 1.0`

#### Criterion B: Subject Competency (`score_B`)
Maps competency tier to a score band. Schools configure tiers; defaults are:

| Tier | Default score | Description |
|---|---|---|
| `primary`    | 1.00 | u's primary teaching subject matches s.subject_id |
| `secondary`  | 0.75 | u is capable at secondary level |
| `capable`    | 0.40 | u can teach but is not specialized |
| `none`       | 0.00 | no competency record for this subject |

The `teacher_competencies` table stores `(teacher_id, subject_id, level)`.
If multiple competency records exist for u and s.subject_id, the **highest** score applies.

Schools may override the default band scores via `substitute_rule_configs` with `criteria_key = "competency_band"` and `custom_params = {primary: 1.0, secondary: 0.7, capable: 0.3, none: 0.0}`.

#### Criterion C: Class Familiarity (`score_C`)
Measures whether u has taught this exact class (subject + grade + section) before, and how recently.

```
let familiarity = teacher_class_familiarities record for (u, s.class_session_id)
if no record exists:
    score_C(u) = 0.0
else:
    let terms_ago = current_term_index - familiarity.last_taught_term_index
    // Exponential decay: recent familiarity matters more
    score_C(u) = familiarity.familiarity_score * exp(-λ * terms_ago)
```

Where:
- `familiarity_score` ∈ [0, 1] is set by admin or derived from historical data (default 0.8 for "taught before")
- `λ` (decay constant) = ln(2) / 3 ≈ 0.231, meaning familiarity halves every 3 terms
- `terms_ago` = 0 → multiplier = 1.0; `terms_ago` = 3 → multiplier ≈ 0.5; `terms_ago` = 6 → multiplier ≈ 0.25

#### Criterion D: Recency Penalty (`score_D`)
Penalizes candidates who substituted very recently, to prevent the same teacher from being repeatedly chosen.

```
let days_since_last_sub = days since u's most recent substitute_assignment (any session)
if days_since_last_sub is NULL:
    score_D(u) = 1.0
else if days_since_last_sub >= 14:
    score_D(u) = 1.0
else:
    // Linear recovery from penalty over 14 days
    score_D(u) = days_since_last_sub / 14.0
```

Schools may configure:
- `recency_penalty_window_days` (default 14)
- `recency_penalty_shape` (`linear` or `exponential`; default `linear`)

For exponential shape:
```
score_D(u) = 1.0 - exp(-days_since_last_sub / τ)
where τ = recency_penalty_window_days / 3
```

### Phase 3 — Composite Score and Ranking

**Weighted Composite Formula**

```
composite_score(u) = w_A * score_A(u) + w_B * score_B(u) + w_C * score_C(u) + w_D * score_D(u)
```

Where `w_A + w_B + w_C + w_D = 1.0` and each `w_i ≥ 0`.

**Default weights** (configurable per school):
| Criterion | Default weight | Rationale |
|---|---|---|
| Workload Balance (A) | 0.30 | Fairness is important but not absolute |
| Subject Competency (B) | 0.35 | Instructional quality is highest priority |
| Class Familiarity (C) | 0.20 | Student continuity matters |
| Recency Penalty (D) | 0.15 | Prevents repetitive burden |

**Tie-Breaking**
If `composite_score` ties within ε = 0.001:
1. Prefer lower `sub_count(u)` (fewer substitutions this term)
2. Prefer higher `score_B(u)` (better subject match)
3. Prefer candidate with alphabetically earlier name (deterministic)

**No Feasible Candidates**
If Phase 1 yields zero feasible candidates for session s:
- Return empty ranked list with a structured reason code: `NO_AVAILABLE_SUBSTITUTE`
- UI shows: "No available teachers — please add external substitute or adjust schedule."
- Audit event is written noting the uncovered session.

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
- Target: ≥ 95% for full-day leave (some sessions may legitimately have no feasible sub)

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
  };
  reason_codes: string[];         // e.g., ["PRIMARY_SUBJECT_MATCH", "LOW_WORKLOAD"]
};
```

- `contribution` = `score * weight` (shows how much each criterion contributed to the composite)
- `detail` = human-readable string: "3 substitutions this term (average: 7.2)" or "Primary subject: Mathematics"
- `reason_codes` = machine-readable tags for UI badges

### Configuration Model

Per-school rule configuration stored in `substitute_rule_configs`:

| `criteria_key` | `weight` | `enabled` | `custom_params` (JSONB) |
|---|---|---|---|
| `workload_balance` | 0.30 | true | `{ "target_distribution": "mean" }` |
| `subject_competency` | 0.35 | true | `{ "primary": 1.0, "secondary": 0.75, "capable": 0.4, "none": 0.0 }` |
| `class_familiarity` | 0.20 | true | `{ "decay_half_life_terms": 3 }` |
| `recency_penalty` | 0.15 | true | `{ "window_days": 14, "shape": "linear" }` |
| `weekly_substitute_cap` | — | true | `{ "max_per_week": 5 }` |
| `exclusion` | — | true | `{ "teacher_ids": [], "subject_ids": [], "grade_level_ids": [] }` |

Constraints on configuration:
- Sum of enabled criteria weights must equal 1.0 (validated on save)
- All weights must be in [0, 1]
- At least one criterion must be enabled
- `weekly_substitute_cap` must be ≥ 1

### Performance Characteristics

For school scale: ~100 teachers, ~5-10 leave events/day, ~3-5 affected sessions per leave.

| Phase | Complexity | Expected Time | Notes |
|---|---|---|---|
| Feasibility | O(n) per session | <10ms | Single query with JOINs |
| Workload aggregation | O(n) | <20ms | Cached in-memory per request |
| Scoring (all criteria) | O(n) per session | <30ms | Pure arithmetic per candidate |
| Ranking | O(n log n) per session | <10ms | Sort ≤100 items |
| **Total per session** | **O(n log n)** | **<100ms** | Well under 2s target |
| **Total per leave (5 sessions)** | — | **<500ms** | Parallelizable per session |

Cache strategy:
- `sub_count(u)` per term: computed once per recommendation request, held in memory
- `teacher_competencies` and `teacher_class_familiarities`: fetched once per request
- No Redis required for MVP; in-memory per request is sufficient at this scale

### Testing Strategy

**Unit Tests — Scoring Engine**
- Test each criterion in isolation with controlled inputs
- Test boundary conditions: zero candidates, one candidate, all identical scores
- Test tie-breaking determinism
- Test weight changes: if w_B is set to 1.0 and others to 0.0, ranking must exactly follow competency tiers
- Test configuration validation: reject configs where weights don't sum to 1.0

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
- Critical performance paths: Substitute recommendation query must complete in <2s for 100 teachers.
- Caching strategy: Teacher workload per term can be cached briefly (Redis or in-memory) during recommendation.
- Pagination/streaming/batching: Session lists paginated; report queries server-side paginated.
- Known limits: Scoring is O(n) per session; ranking is O(n log n) per session where n = teacher count. Total per-leave recommendation is well under 2s at MVP scale. See "Substitute Matching Algorithm Specification" for exact performance model.

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

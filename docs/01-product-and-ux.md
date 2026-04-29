# Product and UX

- Human Action: REVIEW AND CHANGE
- Status: READY
- Owner: AI draft, human approved
- Inputs: `docs/00-app-definition.md`, Steck product patterns, stakeholder notes
- Owns: Product behavior, personas, user journeys, UX direction, screen/state requirements, and design system direction
- Must Not Repeat: Technical architecture, API internals, permission enforcement details, release operations, or task plans
- Update Trigger: Change in functional behavior, user journey, UX pattern, screen/state requirement, or design direction
- Mode Applicability: Any

## Purpose
Define what users can do, how major journeys work, and what UX/design direction the module should follow.

## Product Summary [AIH]
- Core product promise: Schools can plan teacher schedules, handle leave gracefully, and find the best substitute teacher automatically while maintaining fairness and auditability.
- Primary workflow: Admin plans schedule → teachers are rostered → teacher applies leave → admin is notified → system recommends substitutes → admin approves/assigns → audit trail is complete.
- Secondary workflows: Admin reviews workload reports; teacher views their own roster and substitute history.
- Key differentiator: Configurable, explainable substitute matching algorithm that balances fairness, expertise, and class familiarity — not just a manual list.
- Research comparison note: Frontline, PowerSchool SmartFind Express, Red Rover, SchoolFront, TimetableMaster, and Swing-style substitute workflows commonly include coverage-needed flags, availability/qualification filters, preference/exclusion rules, unfilled-job queues, cancellation/reassignment paths, and substitute-facing assignment details. These are added here as draft review items for human approval/amendment.

## Personas [AIH]
| Persona | Goal | Pain point | Success moment | Notes |
|---|---|---|---|---|
| School Admin / Principal | Plan schedules, ensure classes are covered, maintain fairness | Spreadsheets, WhatsApp chaos, no audit trail | See a leave request, get a ranked substitute list, assign with one click | May also be a Steck admin/teacher with multi-role |
| Teacher | Know when I teach, apply leave easily, trust the system is fair | Unclear schedule, manual leave requests, unfair substitute burden | Apply leave in 30 seconds, see my workload is balanced | Only sees own schedule and relevant substitute notifications |
| Substitute / Covering Teacher | Know assigned coverage details and whether action is required | Late or incomplete coverage instructions | Assignment clearly shows class, room, time, notes, and status | MVP assumes internal teachers can be substitutes; external pool is future unless approved |

## User Journeys [AIH]
### Journey 1: Admin Plans Class Schedule and Teacher Roster
- Persona: School Admin
- Trigger: New term or academic year begins; schedule needs to be created or updated.
- Preconditions: School, academic year/term, subjects, grade levels, and teachers exist in Steck.
- Main path:
  1. Admin opens Schedule Planner.
  2. System offers sensible default timetable templates (e.g., standard 5-day school week, common period blocks, AM/PM grouping) that admin can accept or amend.
  3. Admin reviews an overview of timetable structure, classes, teachers, rooms, and equipment/resource conflicts.
  4. Admin creates or imports class sessions (subject + grade + section + room + period + equipment/resource needs).
  5. Admin assigns a teacher to each session.
  6. System generates class schedules, teacher rosters, room schedules, and equipment/resource schedules from the same source of truth.
  7. Admin reviews warnings and makes inline amendments before publishing.
- Success state: Teachers can see their personal timetable; admin sees full school timetable, per-class schedules, room schedules, and equipment/resource schedules.
- Empty/loading/error states: Empty schedule shows guided templates and "start from default" action; validation errors show inline (e.g., double-booked teacher, room/equipment conflict).
- Permission/security notes: Admin-only; scoped to current school and term.
- Required validation later: E2E test for full schedule creation and publish.

### Journey 2: Teacher Applies Leave
- Persona: Teacher
- Trigger: Teacher is sick or needs personal leave.
- Preconditions: Teacher is authenticated, has an active role, and a published roster exists.
- Main path:
  1. Teacher opens Leave page.
  2. Teacher selects date(s) from their personal calendar.
  3. Teacher selects duration: full day, AM half-day, or PM half-day.
  4. Teacher chooses whether substitute coverage is needed.
  5. System previews affected sessions for the selected date(s) and duration.
  6. Teacher enters reason/type (sick, personal, training, etc.) and optional substitute-facing notes/instructions.
  7. Teacher submits request.
  8. System shows confirmation and status.
- Success state: Leave request is recorded with status "pending admin review."
- Empty/loading/error states: If no roster exists, show "No schedule found — contact admin." If date conflicts with past leave, show inline warning.
- Permission/security notes: Teacher can only apply leave for themselves.
- Required validation later: E2E test for leave application and status display.

### Journey 3: Admin Handles Leave and Assigns Substitute
- Persona: School Admin
- Trigger: Notification of new leave request, or admin opens Leave Management page.
- Preconditions: Admin has admin/principal role; leave request exists.
- Main path:
  1. Admin receives in-app (and email) notification: "Teacher X applied leave on Y."
  2. Admin opens Leave Management.
  3. Admin reviews leave details, duration, and affected sessions.
  4. System separates sessions that need coverage from sessions that only need absence recording.
  5. Admin can correct impacted sessions before approval/assignment (e.g., boundary-period correction or school-specific exception), with an audit reason.
  6. For each covered session, system shows a ranked list of recommended substitute teachers.
  7. Each recommendation shows score breakdown (workload, expertise, familiarity, availability/eligibility, preference/exclusion flags when configured).
  8. Admin selects a recommended substitute, manually searches and picks another, or marks the session unfilled for follow-up.
  9. Admin confirms assignment; system updates coverage status for that session.
  10. System notifies the assigned substitute teacher and keeps an audit trail.
- Success state: Substitute is assigned or session is explicitly marked unfilled/no-coverage-needed; affected sessions show coverage status; audit trail is written.
- Empty/loading/error states: If no substitutes are available, show "No available teachers — mark unfilled, adjust filters, or choose manual override."
- Permission/security notes: Admin-only for assignment; substitute teachers see only their own substitute assignments.
- Required validation later: E2E test for notification → review → assign → audit.

### Journey 4: Admin Reviews Workload and Substitute Reports
- Persona: School Admin
- Trigger: End of week/month/term; admin wants to verify fairness.
- Preconditions: Reports module has data.
- Main path:
  1. Admin opens Reports dashboard.
  2. Admin views "Teacher Workload" report: sessions taught + substitute duties per teacher.
  3. Admin views "Leave Summary" report: leave counts by teacher and type.
  4. Admin views "Substitute History" report: who substituted whom, when, and why.
  5. Admin views coverage operations: fill rate, unfilled sessions, cancellations/reassignments, and time-to-fill.
  6. Admin can export reports.
- Success state: Admin can verify fairness and share reports if needed.
- Empty/loading/error states: No data yet shows "No leave or substitute activity this period."
- Permission/security notes: Admin-only; read-only.
- Required validation later: Unit tests for report calculations; E2E for export.

### Journey 5: Substitute / Covering Teacher Handles Assignment
- Persona: Substitute / Covering Teacher
- Trigger: Admin assigns coverage or sends an offer/notification.
- Preconditions: Substitute teacher is authenticated and assignment is within their school.
- Main path:
  1. Substitute receives in-app/email notification.
  2. Substitute opens My Substitute Assignments.
  3. Substitute reviews date, period, class, room, subject, original teacher, school contact, and notes/instructions.
  4. Substitute accepts or declines the assignment offer.
  5. If substitute accepts, assignment becomes active; if substitute declines, coverage returns to unfilled/reassignment workflow.
  6. Admin can later mark assignment completed/canceled if needed.
- Success state: Substitute knows exactly where to go and assignment status is accepted, declined, canceled, or completed.
- Empty/loading/error states: Empty state says "No substitute assignments." Canceled assignment clearly explains it is no longer active.
- Permission/security notes: Substitute can only view assignments involving themselves.
- Required validation later: E2E or integration test for substitute assignment visibility and cancellation state.

### Journey 6: Admin Handles Cancellations, Reassignment, and Unfilled Coverage
- Persona: School Admin
- Trigger: Leave is canceled, substitute is unavailable, or no recommendation is acceptable.
- Preconditions: Leave request or substitute assignment exists.
- Main path:
  1. Admin opens Leave Management or Unfilled Coverage queue.
  2. Admin cancels leave, cancels substitute assignment, reopens recommendation search, or manually assigns another teacher.
  3. System notifies affected teacher/substitute users.
  4. System writes audit events for cancellation/reassignment and preserves history.
- Success state: Coverage state is explicit: covered, unfilled, no coverage needed, canceled, or completed.
- Empty/loading/error states: Unfilled queue shows no rows when all sessions are covered.
- Permission/security notes: Admin-only for cancellation/reassignment; affected teachers see only their own relevant changes.
- Required validation later: Integration tests for lifecycle transitions and audit events.

## Functional Requirements [AIH]
Use stable IDs so the board can map requirements to tasks and validation.

| ID | Requirement | Priority | Mode required | Acceptance signal |
|---|---|---|---|---|
| FR-001 | Admin can define timetable structure from sensible defaults and amend days, periods, AM/PM grouping, and times per school/term | Must | MVP | Default timetable template can be accepted/amended; structure persists and validates |
| FR-002 | Admin can create class sessions (subject, grade, section, room, period, teacher) | Must | MVP | Sessions persist with no double-booking conflicts |
| FR-003 | System generates per-class schedules, per-teacher rosters, room schedules, and equipment/resource schedules from the published schedule | Must | MVP | Admin can view generated schedule projections; teachers see personal timetable |
| FR-004 | Teacher can apply leave for date(s) with reason and type | Must | MVP | Leave request created with pending status |
| FR-005 | Admin receives real-time notification when leave is applied | Must | MVP | Notification appears in-app within seconds |
| FR-006 | System algorithmically recommends substitute teachers for affected sessions | Must | MVP | Ranked list with explainable scores |
| FR-007 | Recommendation considers semester workload balance | Must | MVP | Lower-workload teachers rank higher |
| FR-008 | Recommendation considers subject expertise/competency match | Must | MVP | Teachers with matching subject competency rank higher |
| FR-009 | Recommendation considers class familiarity (past teaching relationship) | Must | MVP | Teachers who taught the class before rank higher |
| FR-010 | School can configure rule weights and enable/disable criteria | Must | MVP | Config changes affect recommendation ranking |
| FR-011 | Admin can override recommendation and manually assign substitute | Must | MVP | Manual assignment persists and is audited |
| FR-012 | Substitute teacher receives notification of assignment | Must | MVP | Substitute sees assignment in app |
| FR-013 | All roster changes, leave requests, and substitute assignments are audited | Must | MVP | Audit log entries are queryable by admin |
| FR-014 | Admin can view workload, leave summary, and substitute history reports | Should | MVP | Reports display accurate aggregated data |
| FR-015 | Reports can be exported to CSV | Should | MVP | CSV download contains correct data |
| FR-016 | Admin can publish/unpublish a schedule | Must | MVP | Published schedule is visible to teachers |
| FR-017 | System prevents double-booking teachers or rooms | Must | MVP | Validation error on conflict |
| FR-018 | Leave request records whether substitute coverage is required | Must | MVP | Admin can distinguish coverage-needed from absence-only sessions |
| FR-019 | Teacher can request full-day, AM half-day, or PM half-day leave; system computes impacted sessions from timetable periods | Must | MVP | Leave request produces correct leave_session_impacts for selected duration |
| FR-020 | Substitute recommendations exclude unavailable or ineligible teachers | Must | MVP | Candidate list omits teachers with conflicts, leave, caps, exclusions, or unavailable status |
| FR-021 | School can configure rich substitute preference and exclusion rules by class, original teacher, subject/grade, subject, teacher, and school-wide scope | Must | MVP | Preferred teachers receive ranking boost; excluded teachers are filtered or penalized according to rule type |
| FR-022 | Substitute assignment lifecycle supports offered, accepted, declined, canceled, completed, and unfilled states | Must | MVP | State transitions persist, notify affected users, and are audited |
| FR-023 | Admin can cancel leave coverage, cancel substitute assignments, and reassign coverage | Must | MVP | Reassignment preserves history and audit trail |
| FR-024 | Admin can create or correct absence/leave records on behalf of a teacher | Should | MVP | Admin-created leave is marked with actor and reason in audit |
| FR-025 | Admin can monitor unfilled coverage and retry recommendation/manual assignment | Must | MVP | Unfilled queue shows open coverage gaps |
| FR-026 | Admin can verify substitute assignment completion/attendance without payroll calculation | Should | MVP | Assignment can be marked completed/no-show/canceled for reporting |
| FR-027 | Substitute teacher can view assignment details and substitute-facing instructions | Must | MVP | Substitute sees class, period, room, subject, original teacher, notes, and status |
| FR-028 | Teacher/admin can add substitute-facing notes or instructions to leave/coverage | Should | MVP | Notes are visible only to admins and assigned substitute |
| FR-029 | Timetable impact respects school calendar exceptions such as holidays, special timetable days, and no-school days | Should | MVP | Leave impact does not create coverage for non-teaching days |
| FR-030 | Multi-role users can act in the correct role/context for each workflow | Must | MVP | Admin/teacher user sees role-scoped navigation and permissions |
| FR-031 | Admin can view coverage operations report: fill rate, unfilled sessions, cancellations, and time-to-fill | Should | MVP | Report matches assignment lifecycle data |
| FR-032 | Rule configuration supports hard eligibility constraints separately from ranking weights | Must | MVP | Hard constraints filter candidates before weighted scoring |
| FR-033 | Admin can adjust computed impacted sessions before approval or coverage assignment | Must | MVP | Admin correction is audited and downstream coverage reflects final impacted sessions |
| FR-034 | Teachers can self-manage substitute availability windows/statuses | Must | MVP | Teacher availability updates affect substitute recommendations |

## Non-Functional Product Requirements [AIH]
- Performance/user-perceived speed: Schedule planner navigation and common amendments should feel responsive (<300ms for local UI interactions when data is loaded). Substitute recommendation should return quickly for common cases but may run up to 2 minutes for complex cases if the UI shows clear calculation status, progress/fallback messaging, safe retry, and manual assignment/unfilled fallback.
- Accessibility: Keyboard-navigable schedule planner; color is not the only signal for status.
- Localization/internationalization: UI chrome and system messages in `en`, `zh-Hant`, `zh-Hans`. User-authored content (reasons, notes) remains as authored.
- Responsiveness/device support: Desktop-optimized for admin planning; teacher leave application must work on tablet and mobile web.
- Reliability expectations: No silent failures for leave or substitute assignments. Errors are explicit and actionable.

## Information Architecture [AIH]
- Primary navigation (Admin): Schedule Planner | Leave Management | Reports | Settings (rule configuration)
- Primary navigation (Teacher): My Timetable | Apply Leave | My Substitute Assignments
- Main sections/routes/screens:
  - `/roster/schedule` — Schedule planner (admin)
  - `/roster/leave` — Leave application (teacher) / Leave management (admin)
  - `/roster/substitutes` — Substitute assignment view
  - `/roster/coverage` — Unfilled coverage queue (admin)
  - `/roster/reports` — Reports dashboard (admin)
  - `/roster/settings` — Rule configuration (admin)
- Object/detail pages: Session detail, leave request detail, substitute assignment detail.
- Settings/admin areas: Rule weights, timetable structure, leave types.
- Public vs authenticated surfaces: All rostering surfaces are authenticated and role-scoped.

## Screen And State Inventory [AIH]
| Screen/state | Purpose | Key content/actions | Empty/loading/error states | Linked journey/FR |
|---|---|---|---|---|
| Schedule Planner | Create/edit timetable and assign teachers | Default timetable templates, overview dashboard, timetable grid, session cards, teacher assignment dropdown, room/equipment schedule views, publish readiness warnings | Empty: "No timetable yet — start from a default template"; Error: teacher/room/equipment double-booking warning | Journey 1, FR-001/002/003/016/017 |
| Teacher Timetable | View personal schedule | Calendar/grid view of sessions | Empty: "No schedule published yet" | Journey 1, FR-003 |
| Leave Application | Apply for leave | Date picker, full-day/AM/PM duration selector, affected-session preview, coverage-needed toggle, reason/type input, substitute-facing notes, submit | Error: date in past, no roster; Warning: boundary period needs admin review | Journey 2, FR-004/018/019/028 |
| Leave Management | Review and act on leave | Leave list, detail panel, duration, affected sessions, impacted-session correction controls, substitute recommendations, coverage-needed/no-coverage-needed state | Empty: "No pending leave"; Error: no substitutes available | Journey 3/6, FR-005/006/011/018/023/025/033 |
| Substitute Assignment Detail | View a specific substitution | Original teacher, substitute, session, room, notes, lifecycle status, audit trail | Canceled/declined state is explicit | Journey 3/5/6, FR-012/022/027 |
| Teacher Availability | Teacher self-service availability management | Calendar/list of available, unavailable, and limited-availability periods | Empty: "No availability overrides"; Error: invalid date/time | Journey 5, FR-020/034 |
| Unfilled Coverage Queue | Track open coverage gaps | Unfilled sessions, retry recommendation, manual override, mark no-coverage-needed | Empty: "All sessions covered" | Journey 6, FR-025 |
| Reports Dashboard | View aggregated data | Workload chart, leave table, substitute history, coverage operations, export buttons | Empty: "No data this period" | Journey 4, FR-014/015/031 |
| Rule Configuration | Configure substitute algorithm | Weight sliders, hard constraints, preference/exclusion rules, enable/disable toggles for criteria | — | FR-010/021/032 |
| Recommendation Run Status | Show substitute recommendation progress when calculation is not immediate | Calculating state, elapsed time, retry, manual assignment fallback, unfilled fallback | Error: calculation failed; Timeout: manual fallback available | Journey 3, FR-006 |

## UX Direction [AIH]
- Experience principles: Clear, predictable, fair. Teachers must trust the system is not arbitrary.
- Interaction style: Form-driven with inline validation; schedule planner uses drag-and-drop or grid-based assignment.
- Density and layout direction: Admin screens are information-dense (tables, grids); teacher screens are sparse and mobile-friendly.
- Admin schedule planning direction: Assume school admins are non-technical. Provide default templates, review dashboards, plain-language warnings, inline amendments, and publish-readiness checks rather than requiring low-level setup from a blank slate.
- Motion/transition expectations: Subtle transitions for status changes; no blocking animations.
- Tone of voice: Professional, calm, supportive. Error messages explain what to do next.
- Accessibility baseline: WCAG 2.1 AA target; semantic tables, keyboard navigation, ARIA labels for schedule grid.

## Design System Direction [AIH]
- Visual style: Follow Steck design system (`packages/ui`). Clean, neutral palette with status colors (pending = amber, approved = green, rejected = red).
- Typography direction: Steck typography scale.
- Color direction: Steck semantic tokens. Schedule grid uses subtle background tints for periods; teacher assignment chips use neutral tones.
- Component principles: Reuse Steck tables, forms, badges, dialogs, date pickers.
- Form behavior: Inline validation, clear labels, save/cancel on complex forms.
- Table/list behavior: Sortable, filterable, paginated for teacher lists and leave history.
- Feedback/toast/dialog behavior: Toast for success; dialog for confirmations (e.g., assign substitute); inline error for validation.
- Icons/illustrations/media: Steck icon set. Schedule grid may use minimal icons for subject types.

## Content Requirements [OPT]
- Required copy blocks: Leave type labels (sick, personal, training, other); substitute recommendation score labels (workload, expertise, familiarity); empty states for all screens.
- Error message style: Plain language, actionable. Example: "This teacher is already assigned to a session at this time. Choose a different teacher or change the period."
- Empty state copy: Helpful and contextual. Example: "No pending leave requests. When a teacher applies leave, you will see it here."
- Help/onboarding copy: Brief tooltip or inline help for rule configuration and score breakdown.

## Product/UX Approval Checklist
Before system design or board compilation proceeds, confirm:
- personas and journeys are coherent
- functional requirements have IDs
- key screens and states are covered
- UX direction is specific enough to avoid generic UI
- accessibility and responsive expectations are explicit enough for the selected mode
- journeys can later map to validation tasks

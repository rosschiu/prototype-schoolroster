# Product and UX

- Human Action: REVIEW AND CHANGE
- Status: Draft
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

## Personas [AIH]
| Persona | Goal | Pain point | Success moment | Notes |
|---|---|---|---|---|
| School Admin / Principal | Plan schedules, ensure classes are covered, maintain fairness | Spreadsheets, WhatsApp chaos, no audit trail | See a leave request, get a ranked substitute list, assign with one click | May also be a Steck admin/teacher with multi-role |
| Teacher | Know when I teach, apply leave easily, trust the system is fair | Unclear schedule, manual leave requests, unfair substitute burden | Apply leave in 30 seconds, see my workload is balanced | Only sees own schedule and relevant substitute notifications |

## User Journeys [AIH]
### Journey 1: Admin Plans Class Schedule and Teacher Roster
- Persona: School Admin
- Trigger: New term or academic year begins; schedule needs to be created or updated.
- Preconditions: School, academic year/term, subjects, grade levels, and teachers exist in Steck.
- Main path:
  1. Admin opens Schedule Planner.
  2. Admin defines timetable structure (days, periods, start/end times).
  3. Admin creates class sessions (subject + grade + section + room + period).
  4. Admin assigns a teacher to each session.
  5. System generates the teacher working roster (which teacher teaches when).
  6. Admin reviews and publishes the schedule.
- Success state: Teachers can see their personal timetable; admin sees full school timetable.
- Empty/loading/error states: Empty schedule shows guidance and template options; validation errors show inline (e.g., double-booked teacher, room conflict).
- Permission/security notes: Admin-only; scoped to current school and term.
- Required validation later: E2E test for full schedule creation and publish.

### Journey 2: Teacher Applies Leave
- Persona: Teacher
- Trigger: Teacher is sick or needs personal leave.
- Preconditions: Teacher is authenticated, has an active role, and a published roster exists.
- Main path:
  1. Teacher opens Leave page.
  2. Teacher selects date(s) from their personal calendar.
  3. Teacher selects affected sessions (or all-day).
  4. Teacher enters reason/type (sick, personal, training, etc.).
  5. Teacher submits request.
  6. System shows confirmation and status.
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
  3. Admin reviews leave details and affected sessions.
  4. For each affected session, system shows a ranked list of recommended substitute teachers.
  5. Each recommendation shows score breakdown (workload, expertise, familiarity).
  6. Admin selects a recommended substitute or manually searches and picks another.
  7. Admin confirms assignment; system updates roster for that session.
  8. System notifies the assigned substitute teacher.
- Success state: Substitute is assigned; affected sessions show updated teacher; audit trail is written.
- Empty/loading/error states: If no substitutes are available, show "No available teachers — please add external substitute or adjust schedule."
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
  5. Admin can export reports.
- Success state: Admin can verify fairness and share reports if needed.
- Empty/loading/error states: No data yet shows "No leave or substitute activity this period."
- Permission/security notes: Admin-only; read-only.
- Required validation later: Unit tests for report calculations; E2E for export.

## Functional Requirements [AIH]
Use stable IDs so the board can map requirements to tasks and validation.

| ID | Requirement | Priority | Mode required | Acceptance signal |
|---|---|---|---|---|
| FR-001 | Admin can define timetable structure (days, periods, times) per school/term | Must | MVP | Timetable structure persists and validates |
| FR-002 | Admin can create class sessions (subject, grade, section, room, period, teacher) | Must | MVP | Sessions persist with no double-booking conflicts |
| FR-003 | System generates teacher working roster from published schedule | Must | MVP | Teachers see personal timetable |
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

## Non-Functional Product Requirements [AIH]
- Performance/user-perceived speed: Schedule planner actions feel instant (<300ms). Substitute recommendation returns in <2 seconds for 100 teachers.
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
  - `/roster/reports` — Reports dashboard (admin)
  - `/roster/settings` — Rule configuration (admin)
- Object/detail pages: Session detail, leave request detail, substitute assignment detail.
- Settings/admin areas: Rule weights, timetable structure, leave types.
- Public vs authenticated surfaces: All rostering surfaces are authenticated and role-scoped.

## Screen And State Inventory [AIH]
| Screen/state | Purpose | Key content/actions | Empty/loading/error states | Linked journey/FR |
|---|---|---|---|---|
| Schedule Planner | Create/edit timetable and assign teachers | Timetable grid, session cards, teacher assignment dropdown, publish button | Empty: "No timetable yet — add periods"; Error: double-booking warning | Journey 1, FR-001/002/016/017 |
| Teacher Timetable | View personal schedule | Calendar/grid view of sessions | Empty: "No schedule published yet" | Journey 1, FR-003 |
| Leave Application | Apply for leave | Date picker, session selector, reason/type input, submit | Error: date in past, no roster | Journey 2, FR-004 |
| Leave Management | Review and act on leave | Leave list, detail panel, affected sessions, substitute recommendations | Empty: "No pending leave"; Error: no substitutes available | Journey 3, FR-005/006/011 |
| Substitute Assignment Detail | View a specific substitution | Original teacher, substitute, session, reason, audit trail | — | Journey 3, FR-012 |
| Reports Dashboard | View aggregated data | Workload chart, leave table, substitute history, export buttons | Empty: "No data this period" | Journey 4, FR-014/015 |
| Rule Configuration | Configure substitute algorithm | Weight sliders, enable/disable toggles for criteria | — | FR-010 |

## UX Direction [AIH]
- Experience principles: Clear, predictable, fair. Teachers must trust the system is not arbitrary.
- Interaction style: Form-driven with inline validation; schedule planner uses drag-and-drop or grid-based assignment.
- Density and layout direction: Admin screens are information-dense (tables, grids); teacher screens are sparse and mobile-friendly.
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

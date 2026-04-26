# App Definition

- Human Action: YES
- Status: Draft
- Owner: Human-selected, AI-structured
- Inputs: Human intent, business context, stakeholder goals, and Steck platform constraints
- Owns: App purpose, mode, scope, success criteria, real-vs-mocked decisions, non-goals, and tradeoff rules
- Must Not Repeat: Detailed UX screens, architecture internals, permission matrices, release procedures, or task plans
- Update Trigger: Change in app purpose, mode, scope, success criteria, shortcut policy, or launch boundary
- Mode Applicability: Any

## Purpose
Define the Steck Teacher Rostering module: what is being built, why it matters, what is in and out of scope, and what quality mode applies.

## App Intent [HMN]
- App name: Steck Teacher Rostering Module
- One-sentence concept: A school operations module for yearly class schedule planning, teacher leave management, and algorithmic substitute teacher (代課老師) assignment with configurable rules, audit trails, and reporting.
- Primary users: School administrators / principals, teachers
- Primary problem: Schools currently manage teacher schedules and leave replacements through spreadsheets, WhatsApp groups, or ad hoc phone calls. This leads to unfair workload distribution, missed classes, no audit trail, and poor matching of substitute teachers to subject expertise and student familiarity.
- Desired outcome: Administrators can plan class schedules and teacher rosters; teachers can apply leave through the system; the system immediately notifies admins and algorithmically recommends the best available substitute teacher based on configurable school-specific rules; every decision is auditable and reportable.
- Business or personal context: This is a new module for the Steck school operations platform. It will be developed separately in this repo and merged back into the main Steck monorepo once the MVP is complete.

## Delivery Mode [HMN]
- Selected mode: MVP
- Why this mode: The module must support real weekly school operations for a limited set of schools. Core flows (schedule planning, leave, substitute matching, audit) must be real and reliable, but feature breadth can be limited to the committed scope.
- Primary success criterion for this mode: One school can plan a term schedule, manage teacher leave, and assign substitute teachers through the module without developer intervention, with reliable audit trails and fair workload distribution.
- What would make this effort unsuccessful: The substitute matching algorithm is untrustworthy or opaque; leave workflows lack audit trails; the module cannot integrate cleanly back into Steck.

## Mode Reference
### Mockup
- Goal: Validate concept, layout, content, and user flow direction.
- Data/backend expectation: Fully mocked is acceptable.
- Not expected: Real auth, durable persistence, broad test coverage, production architecture.

### Prototype
- Goal: Validate interaction patterns, technical feasibility, or a narrow workflow.
- Data/backend expectation: Mocked, partial real services, or throwaway integrations are acceptable if explicit.
- Not expected: Full polish, full coverage, or long-term maintainability everywhere.

### MVP
- Goal: Deliver a usable end-to-end product for limited real users and workflows.
- Data/backend expectation: Real for in-scope flows; secondary capabilities may be mocked if documented.
- Not expected: Full feature breadth, enterprise hardening, or every edge case.

### Production
- Goal: Deliver a reliable, supportable, secure release for ongoing use.
- Data/backend expectation: Real systems for in-scope flows unless feature-flagged or explicitly documented.
- Not expected: Undocumented shortcuts, unclear ownership, weak rollback/recovery planning.

## Scope Boundary [AIH]
### In Scope Now
- Yearly/term class schedule planning with session definitions (periods, days, rooms).
- Teacher working roster derived from the class schedule.
- Teacher leave application with date/session selection and reason.
- Real-time admin notification when leave is applied.
- Algorithmic substitute teacher recommendation engine with configurable criteria.
- Substitute criteria: (1) workload balancing across a semester, (2) subject expertise/competency match, (3) class familiarity/relationship, (4) school-configurable rule weights and additional custom rules.
- Admin override and manual substitute selection.
- Audit trail for all roster changes, leave applications, and substitute assignments.
- Reporting dashboard: teacher workload, leave summary, substitute history.
- Integration path back into Steck monorepo (shared auth, users, roles, school tenancy).

### Not In Scope Now
- Student attendance tracking (deferred to future SIS scope).
- Payroll or compensation calculations for substitute teaching.
- Deep external calendar sync (Google/Outlook).
- SMS or push notifications; in-app and email only.
- Multi-campus / district-wide rostering.
- AI-generated lesson plans for substitute teachers.
- Parent-facing leave or substitute visibility.
- Mobile-native app.

### Later / Possible Future Scope [OPT]
- Partial-day or session-level leave (currently daily granularity).
- Recurring leave patterns (e.g., every Tuesday).
- Substitute teacher rating/feedback loop.
- Automatic approval workflows for leave based on school policy.
- Conflict detection with external school events.

## Success Criteria [AIH]
The project is successful when:
- A school admin can plan a full term schedule and assign teachers to sessions without errors.
- A teacher can apply leave and see its status in real time.
- An admin receives a notification within seconds of leave being applied.
- The substitute recommendation algorithm produces a ranked, explainable list of candidates within 2 seconds for up to 100 teachers.
- The admin can accept a recommendation or manually select a substitute, with all actions audited.
- A workload report shows fair distribution of substitute duties within a semester.
- The module can be merged back into Steck with minimal architectural friction.

## Real vs Mocked [AIH]
### Must Be Real
- Auth: Must integrate with Steck's first-party school-scoped auth.
- Data persistence: PostgreSQL for schedules, rosters, leave requests, substitute assignments, audit events.
- Integration: Steck user/role/school membership APIs; Steck notification/email service.
- Reporting/analytics: Real workload and leave reports from persisted data.
- Other: Substitute matching algorithm must run against real data.

### May Be Mocked
- Integration: External calendar sync (Google/Outlook) — out of scope.
- Notification: Email provider may be a stub in local development before Steck email integration.
- Analytics: Advanced trend analytics beyond basic workload/leave reporting.
- Other: Early reporting dashboard UI may begin as a safe-to-mock shell.

## Constraints [HMN]
- Budget/time constraint: MVP target; must be mergeable back to Steck within a reasonable timeframe.
- Platform/device constraint: Web app only (React + Vite), same as Steck. Must work on desktop for admin planning and tablet/mobile for teacher leave application.
- Brand/design constraint: Must reuse Steck design system (`packages/ui`) and localization (`en`, `zh-Hant`, `zh-Hans`).
- Legal/compliance constraint: Teacher and schedule data are sensitive school records. Audit trail is mandatory.
- Team/maintenance constraint: Developed separately now, but must merge cleanly into Steck monorepo later.
- Existing system constraint: Must conform to Steck architecture (Fastify API, PostgreSQL, modular monolith, shared contracts, school tenancy, RBAC).

## Quality Expectations By Mode [AIH]
- UX fidelity required: High. Must feel like a native Steck module, not an external tool.
- Code maintainability required: High. Must merge cleanly into Steck; production-grade for auth, audit, data integrity.
- Test expectation: Strong tests for the substitute matching algorithm (unit), leave workflow state transitions (integration), and permission boundaries (integration). Selective E2E for core journeys.
- Security expectation: Production-grade for tenant scoping, role checks, audit, and data access.
- Performance expectation: Substitute recommendation must return in under 2 seconds for 100 teachers. Schedule planning must feel responsive.
- Documentation expectation: Active docs in `docs/` remain source of truth; module must be documented for Steck merge.

## Acceptable Shortcuts [AIH]
| Shortcut | Why acceptable in this mode | Removal trigger |
|---|---|---|
| Reporting dashboard UI may start as a safe-to-mock shell. | Helps UI work proceed while report data contracts are finalized. | Before pilot or when report data is wired. |
| Email delivery may use a stub provider in local dev. | Steck email integration path is known but not yet wired in this repo. | Before merge back to Steck or pilot testing. |
| Partial-day leave is not supported; only full-day leave. | Simplifies first version; most school leave is full-day initially. | When schools request half-day or session-level leave. |

## Unacceptable Shortcuts [HMN]
- Not allowed even in this mode:
  - Demo-only auth or bypassing Steck role/tenant checks.
  - Cross-tenant data access.
  - Silent mutations to schedule or roster without audit.
  - Hard-deleting leave or substitute records that should be recoverable/auditable.
  - Opaque substitute algorithm with no explainable ranking.
- Not allowed without human approval:
  - New dependencies outside Steck's approved stack.
  - Changes to Steck auth, permission, or tenancy models.
  - Architecture changes that would complicate the merge back.

## Tradeoff Rules [HMN]
When there is tension between speed and rigor:
- Prioritize: auditability, fair workload distribution, data integrity, and clean Steck merge path.
- Accept: temporary UI shells for non-critical surfaces and local-only email stubs.
- Do not compromise: auth, tenant safety, audit trails, or the correctness/explainability of the substitute matching algorithm.

## Human Approval Checklist
Before downstream docs or board planning proceed, confirm:
- delivery mode is selected
- in-scope and out-of-scope boundaries are clear
- real vs mocked decisions are explicit
- unacceptable shortcuts are listed
- success criteria are testable enough to validate later

# Safety and Permissions

- Human Action: REVIEW AND CHANGE
- Status: READY
- Owner: AI draft, human approved
- Inputs: `docs/00-app-definition.md`, `docs/01-product-and-ux.md`, `docs/02-system-design.md`, Steck security patterns
- Owns: Auth, permissions, privacy, compliance, sensitive data, abuse cases, security risks, and safety validation expectations
- Must Not Repeat: Full architecture details, broad product requirements, or release procedures unless they affect safety decisions
- Update Trigger: Change in auth, permission rules, sensitive data, compliance scope, threat model, or production exposure
- Mode Applicability: MVP / Production; lightweight for Prototype; optional for pure Mockup

## Purpose
Make security, privacy, and permission expectations explicit before implementation tasks are compiled.

## Safety Summary [AIH]
- Auth required: Yes — standalone MVP school-scoped auth runtime first, but persisted identity/session data must use Steck-compatible auth tables so Steck auth integration can be swapped in near app readiness/merge.
- User roles involved: School admin / principal, teacher.
- Sensitive data involved: Teacher schedules, leave reasons, substitute assignments, workload data.
- Compliance concerns: Teacher data privacy; audit trail for operational decisions.
- Highest safety risk: A teacher viewing another teacher's schedule or leave without authorization; an admin assigning a substitute without proper role check; cross-tenant data leakage.

## Auth Model [AIH]
- Authentication method: Standalone MVP email/password or seeded local users with secure session cookie; must persist through Steck-compatible `auth_users`, `school_memberships`, `role_assignments`, `teachers`, and `auth_sessions` tables.
- Session/token model: Secure `HttpOnly` `SameSite=Lax` cookie with CSRF companion token.
- Signup/invite model: MVP may use seeded/local admin-managed users. Steck people/roster integration is deferred until merge readiness.
- Password/SSO/MFA expectations: MVP standalone auth is sufficient for local/pilot testing; Steck SSO/MFA expectations apply after merge.
- Account recovery expectations: MVP can be admin reset/manual; inherits Steck recovery flow after merge.

## Roles And Permission Matrix [AIH]
| Role | Can view | Can create | Can edit | Can delete | Admin/special actions | Notes |
|---|---|---|---|---|---|---|
| School admin / principal | All school schedules, all leave requests, all substitute assignments, all reports, audit trail | Timetables, sessions, substitute assignments, rule configs, competencies | Timetables, sessions, substitute assignments, rule configs, leave status (approve/reject) | Sessions, unpublished timetables, substitute assignments (cancel) | Publish/unpublish schedule; approve/reject leave; override substitute recommendation | Scoped to own school only |
| Teacher | Own timetable, own leave requests, own substitute assignments, own availability | Own leave requests and own availability only | Own leave requests (before approval); own availability; accept/decline own substitute offers | Own leave requests (before approval); own availability overrides | Accept/decline own substitute assignment offers | Cannot view other teachers' schedules or leave |

## Resource-Level Rules [AIH]
| Resource | Rule | Roles/users affected | Enforcement point | Test expectation |
|---|---|---|---|---|
| timetable | View: admin only; teachers see derived roster only | admin, teacher | API route + service layer | Integration test |
| rostering_schedule_session | View: admin all; teacher own sessions only | admin, teacher | API route + service layer | Integration test |
| leave_request | View: admin all; teacher own only; teacher may create full-day/AM/PM leave for self only | admin, teacher | API route + service layer | Integration test |
| leave_session_impact | Admin can adjust impacted sessions and coverage requirement with audit reason; teacher can view own computed impacts but cannot alter them after submit | admin, teacher | API route + service layer | Integration test |
| substitute_assignment | View: admin all; substitute teacher own only; response/cancel rights limited by role and assignment status | admin, teacher | API route + service layer | Integration test |
| rule_config | View/edit: admin only | admin | API route + service layer | Integration test |
| availability/preference/exclusion | Teacher manages own availability; admin manages school-wide availability overrides and rich preference/exclusion rules | admin, teacher | API route + service layer | Integration test |
| report | View: admin only | admin | API route + service layer | Integration test |
| competency/familiarity | View: admin only | admin | API route + service layer | Integration test |

## Sensitive Data [AIH]
| Data type | Sensitivity | Storage | Access rules | Retention/deletion | Notes |
|---|---|---|---|---|---|
| Teacher schedule | Medium | PostgreSQL | Admin all; teacher own only | Retain per term; archive after term | Derived from `rostering_schedule_sessions` |
| Leave request (reason) | Medium | PostgreSQL | Admin all; teacher own only | Retain indefinitely for audit | Personal/sick reasons are sensitive |
| Leave duration and impacted sessions | Medium | PostgreSQL | Admin all; teacher own only; assigned substitute sees only assigned coverage details | Retain with leave history | Reveals when a teacher is absent for full day or half day |
| Substitute assignment | Medium | PostgreSQL | Admin all; involved teachers only | Retain indefinitely for audit | Shows when a teacher was absent |
| Substitute-facing notes/instructions | Medium | PostgreSQL | Admin and assigned substitute only | Retain with leave/assignment history | May include class logistics; should avoid sensitive student details |
| Availability/preference/exclusion rules | Medium | PostgreSQL | Teacher own availability; admin school-wide availability overrides and preference/exclusion rules | Retain per term or until changed | Can affect fairness and workload |
| Workload report | Medium | PostgreSQL (aggregated query) | Admin only | N/A (query-time) | Could reveal performance concerns |
| Audit events | Medium-High | PostgreSQL | Admin/support only | Retain indefinitely | Append-only |

## Privacy And Compliance [HMN/AIH]
- Applicable policies/regulations: School data protection policies; local privacy laws depending on deployment market.
- Consent requirements: Teachers are school employees; consent managed through employment and school policy.
- Data export/delete requirements: Teacher may request export of own leave/schedule data; deletion requires admin approval and audit.
- Audit/logging requirements: All leave approvals, rejections, substitute assignments, schedule publishes, and rule changes must be audited.
- Regional constraints: Deployed where Steck is deployed; follow Steck compliance posture.

## Abuse Cases And Threats [AIH]
| Risk | Scenario | Impact | Mitigation | Validation |
|---|---|---|---|---|
| Cross-tenant schedule leakage | Teacher A from School X accesses School Y schedule | Data breach | Strict school_id scoping on every query; session validation | Integration test |
| Unauthorized leave approval | Teacher approves their own leave via API manipulation | Policy violation | Role check on approve endpoint; teacher cannot approve own leave | Integration test |
| Unauthorized impact adjustment | Teacher changes impacted sessions to avoid coverage or admin edits without reason | Coverage/audit integrity issue | Only admin can use impact-adjustment API; adjustment reason required; audit event written | Integration test |
| Leave request spam | Teacher submits hundreds of leave requests | Admin noise, DB bloat | Rate limiting on leave submission; max pending limit | Unit + integration test |
| Substitute assignment manipulation | Non-admin assigns substitute via forged request | Wrong teacher in class | Role check on substitute assignment endpoint | Integration test |
| Unauthorized substitute response | Teacher accepts/declines another teacher's assignment | Coverage disruption | Assignment response requires assigned substitute identity | Integration test |
| Hidden unfilled coverage | System silently fails to fill a required session | Students left without coverage | Explicit unfilled status/queue and admin alerts | E2E + integration test |
| Sensitive notes leakage | Substitute-facing notes expose private teacher/student information broadly | Privacy breach | Notes visible only to admins and assigned substitute; guidance to avoid sensitive student data | Integration test + UX copy review |
| Algorithm gaming | Admin sets extreme weights to favor certain teachers | Unfair workload | Weight validation (0-100, sum normalization); audit rule changes | Unit test |
| Audit tampering | Malicious actor deletes audit records | Loss of accountability | Audit table append-only; no DELETE endpoint | Integration test |

## Security Implementation Requirements [AIH]
- Input validation: All IDs must be UUIDs or valid integers; dates must be valid and within term; reason text max length enforced.
- Output encoding: Standard JSON; no user-authored content rendered as HTML without sanitization.
- CSRF/CORS/session protection: Standalone MVP must implement secure cookie + CSRF protection compatible with Steck strategy; all unsafe methods require valid CSRF token.
- Secrets handling: Local MVP auth/session secrets only; migrate to Steck shared config at merge.
- Rate limiting/abuse prevention: Leave submission rate-limited per teacher; admin actions logged.
- File upload/download safety: No file uploads in this module.
- Dependency/package policy: No new dependencies without approval; reuse Steck packages.

## Safety Approval Boundaries [HMN]
Human approval required before:
- auth model changes
- permission model changes
- sensitive data storage changes
- compliance posture changes
- destructive data operations (hard-delete leave or audit)
- weakening validation or auditability

## Safety Validation Checklist
Before launch readiness, confirm:
- permission matrix has tests or validation tasks
- sensitive data handling is implemented as approved
- auth/session behavior is tested where relevant
- abuse/error paths are considered for selected mode
- security-sensitive shortcuts are documented and accepted

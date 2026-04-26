# Quality and Release

- Human Action: REVIEW AND CHANGE
- Status: Draft
- Owner: AI draft, human approved
- Inputs: `docs/00-app-definition.md`, `docs/01-product-and-ux.md`, `docs/02-system-design.md`, `docs/03-safety-and-permissions.md`
- Owns: Engineering quality profile, test strategy, validation layers, CI/build expectations, delivery operations, launch checks, release runbook, and rollback expectations
- Must Not Repeat: Full product requirements, UX details, API definitions, or permission matrices
- Update Trigger: Change in mode, quality bar, platform, test strategy, delivery/deploy process, launch criteria, or production exposure
- Mode Applicability: Any; depth scales by mode

## Purpose
Define how we know the app is correct, integrated, launchable, and supportable for the selected mode.

## Quality Profile By Mode [AIH]
- Selected quality level: Standard (MVP with production-grade rigor for auth, audit, and algorithm correctness)
- Why this level fits: The module handles sensitive school operational data and must merge cleanly into Steck. Core flows need reliability; non-critical UI may start as shells.
- Required checks before task done: Unit tests for algorithm and service logic; integration tests for API contracts; no lint/typecheck errors.
- Required checks before wave done: All wave tasks pass unit/integration tests; E2E for wave-critical journeys passes.
- Required checks before launch: All quality gates pass; permission safety validated; audit completeness confirmed; E2E core journeys pass; Steck merge readiness reviewed.

## Engineering Standards [AIH]
- Code organization: Modular monolith aligned with Steck. Domain services under `apps/api/src/rostering/`. Feature folders under `apps/web/src/features/roster-*`. Shared contracts in `packages/contracts`.
- Type safety/compile expectations: Strict TypeScript. All API contracts typed. No `any` in domain logic.
- Lint/format expectations: Prettier + ESLint aligned with Steck `packages/config`.
- Error handling expectations: Structured errors with stable codes and message keys for localization. No uncaught exceptions in API handlers.
- Accessibility expectations: WCAG 2.1 AA target. Keyboard-navigable schedule grid. Color not sole status signal.
- Performance expectations: Substitute recommendation <2s for 100 teachers. Schedule planner actions <300ms.
- Documentation expectations: Docs updated per decision. Algorithm documented. Merge plan documented.

## Test Strategy [AIH]
| Layer | Required? | Tool/command | Scope | When run |
|---|---|---|---|---|
| Static/type/lint | Yes | `npm run lint`, `npm run typecheck` | All changed files | CI + pre-commit |
| Unit | Yes | Vitest | Algorithm, services, utilities, conflict detection | CI + local |
| Integration | Yes | Vitest + test DB | API endpoints, permission boundaries, audit writes | CI + local |
| E2E/platform journey | Yes | Playwright | Core journeys: schedule → leave → substitute → report | CI + local |
| Contract/API | Yes | TypeScript types + integration tests | Request/response shapes match contracts | CI |
| Accessibility | Should | axe-core or Playwright a11y | Critical screens: schedule planner, leave form | CI |
| Performance smoke | Should | Playwright + timing assertions | Substitute recommendation latency | CI |

## Platform E2E Standard [AIH]
- Web: Playwright by default unless another tool is approved.
- Mobile: Not applicable (web-only module).
- Desktop: Not applicable (web-only module).
- Backend/API-only: API journey tests, contract tests, migration tests, test DB validation.
- CLI: Not applicable.

## Critical Flow Coverage [AIH]
| Flow/journey | Required validation | Fixture/test user | Expected proof | Linked requirement |
|---|---|---|---|---|
| Admin creates timetable and sessions | E2E + integration | admin user | Published schedule visible to teachers | FR-001/002/016 |
| Teacher applies leave | E2E + integration | teacher user | Leave request pending; admin notified | FR-004/005 |
| Admin assigns substitute | E2E + integration | admin user | Substitute assigned; substitute notified; audit written | FR-006/011/012/013 |
| Permission boundary: teacher cannot access admin data | Integration | teacher user | 403 on admin endpoints | Security |
| Cross-tenant isolation | Integration | teacher user | 404/403 on other school data | Security |
| Workload report accuracy | Unit + integration | admin user | Report matches calculated workloads | FR-014 |
| Algorithm explainability | Unit | — | Score breakdown is deterministic and documented | FR-006/007/008/009 |

## Delivery Pipeline [AIH]
- Local setup command: `npm install` (inherits Steck setup)
- Development command: `npm run dev` (starts web + API with hot reload)
- Test command(s): `npm run test`, `npm run test:integration`, `npm run test:e2e`
- Build command: `npm run build`
- Start/preview command: `npm run build && npm run start`
- CI expectation: Lint, typecheck, unit tests, integration tests pass on every PR.
- Minimum checks before merge: All automated checks green; human code review for domain logic.
- Minimum checks before deploy/release: E2E passes; Steck merge plan reviewed.

## Environment Strategy [AIH]
| Environment | Needed now? | Purpose | Notes |
|---|---|---|---|
| Local | Yes | Development, testing | Docker Compose with PostgreSQL |
| Dev | Yes | Integration testing, Steck merge validation | Shared dev instance if available |
| Staging | Yes | Pre-launch validation | Steck staging with module integrated |
| Production | Later | Real school use | After pilot validation and merge |

## Data And Migration Operations [OPT]
- Migration discipline: Repeatable migrations under `apps/api/src/db/migrations/`. No manual production edits.
- Seed/test data expectation: Test seeds for local/dev; no production assumptions.
- Backward compatibility expectation: Migrations additive first; destructive changes require explicit plan.
- Rollback expectation for data/schema changes: Migrations should be reversible where possible. Feature-flag if risky.
- Backup/restore expectation: Inherits Steck DB backup policy.

## Launch Validation Checklist [AIH]
The board must include validation tasks for relevant items.

- [ ] Clean install from checkout works
- [ ] Required config/env vars are documented and validated
- [ ] Migrations/seeding work if applicable
- [ ] Production build/package succeeds
- [ ] App starts from documented command
- [ ] Required unit/integration/contract tests pass
- [ ] Required platform E2E journeys pass
- [ ] Permission/security checks pass where relevant
- [ ] Error/empty/loading states are validated for critical flows
- [ ] Accessibility smoke passes where relevant
- [ ] Performance smoke passes where relevant
- [ ] Release/runbook instructions are accurate
- [ ] Known gaps are documented and accepted

## Release Model [AIH]
- Release style: Manual merge back to Steck monorepo; then follows Steck release cycle.
- Deployment style: Feature-flagged in Steck if possible, to allow gradual rollout.
- Feature flag expectation: Rostering module can be enabled per school if Steck supports feature flags.
- Rollback expectation: Revert merge or disable feature flag. DB migrations reversible.
- Hotfix path: Fix in this repo or Steck repo depending on where the issue is.
- Manual approval needed before deploy: Yes — human approves Steck merge and pilot launch.

## Runbook [AIH]
- How to install: `npm install` in monorepo root.
- How to configure: Copy `.env.example`; ensure PostgreSQL and Steck services are reachable.
- How to run locally: `npm run dev` starts web and API.
- How to test: `npm run test` (unit), `npm run test:integration` (API), `npm run test:e2e` (Playwright).
- How to build: `npm run build`.
- How to deploy/release: Merge to Steck main branch; follow Steck deployment runbook.
- How to rollback: Revert merge commit; run down-migrations if needed; disable feature flag.
- How to inspect logs/errors: Steck structured logs; API request logs; browser console for frontend.

## Quality/Release Approval Checklist
Before implementation or launch validation proceeds, confirm:
- quality level matches selected mode
- task/wave/launch gates are explicit
- platform E2E strategy is defined
- delivery commands are known or planned as tasks
- launch validation tasks can be generated from this doc

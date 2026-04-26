# Coverage and Success Gates

- Human Action: REVIEW AND CHANGE
- Status: Draft
- Owner: Framework default, human approved
- Inputs: Source docs `00`-`04`, board plan in `project/index.html`, validation results
- Owns: Definition of ready, definition of done, required coverage matrices, launch success gates, and completion criteria
- Must Not Repeat: Full requirements, task payloads, or detailed test implementation
- Update Trigger: Change in quality bar, board schema, validation strategy, launch expectations, or completion criteria
- Mode Applicability: Any; depth scales by mode

## Purpose
Make success measurable and prevent disconnected feature slices.

An app is not complete because files exist. It is complete when requirements, journeys, integrations, permissions, and launch checks are covered by implemented and validated work.

## Required Coverage Matrices
The board should include or generate these matrices before coding.

### Requirement Coverage
| Requirement ID | Implementation tasks | Integration task | Validation task | Status |
|---|---|---|---|---|
| FR-001 |  |  |  | Missing / Planned / Done |

### Journey Coverage
| Journey ID | Screens/routes | API/service/data tasks | E2E/platform validation | Status |
|---|---|---|---|---|
| JOURNEY-001 |  |  |  |  |

### Screen/State Coverage
| Screen/state ID | Route/component | Data/API dependency | Empty/loading/error coverage | Validation |
|---|---|---|---|---|
| SCREEN-001 |  |  |  |  |

### Data Coverage
| Entity ID | Schema/model task | Service/API task | UI/admin task | Migration/seed/test |
|---|---|---|---|---|
| ENTITY-001 |  |  |  |  |

### API/Integration Coverage
| API/integration ID | Implementation task | Consumer task | Contract/failure validation | Status |
|---|---|---|---|---|
| API-001 |  |  |  |  |

### Permission Coverage
| Permission ID | Enforcement point | Implementation task | Validation task | Status |
|---|---|---|---|---|
| PERM-001 |  |  |  |  |

### Launch Coverage
| Launch criterion | Validation task | Command/proof | Status |
|---|---|---|---|
| Clean install |  |  |  |
| Build/package |  |  |  |
| Start app |  |  |  |
| Core E2E journeys |  |  |  |

## Definition Of Ready For Source Docs
Source docs are ready only when:
- app mode is selected
- in-scope/out-of-scope boundaries are clear
- must-have requirements are testable
- core journeys are step-by-step
- core screens/states are listed
- data entities are identifiable
- integrations are real/mocked and failure behavior is known
- auth/permissions are defined if relevant
- quality/test/launch expectations are specific enough to create validation tasks
- assumptions are labeled safe / needs human / blocks work

## Definition Of Ready For Board Tasks
A task is ready only when:
- parent epic and wave exist
- dependencies are listed and satisfiable
- objective is clear
- linked source IDs are listed
- owned paths are listed
- allowed touch points are listed
- integration surface is listed
- input/output contract is listed
- implementation steps are ordered
- quality gate exists
- acceptance criteria are testable
- validation relationship is clear
- no blocking assumption applies

## Definition Of Done For Tasks
A task is done only when:
- requested code/docs were changed
- work is wired through the declared integration surface
- acceptance criteria pass
- quality gate commands/checks passed or approved blocker exists
- review was completed
- no unrelated changes were introduced
- files touched are recorded
- board status and handoff notes are updated

## Definition Of Done For Waves
A wave is done only when:
- all tasks are done or approved deferred
- integration tasks are done
- wave validation passes
- affected app areas build/start/load
- no critical blockers remain
- coverage matrices are updated

## Definition Of Done For App Completion
The app is complete only when:
- all must-have requirements are implemented and validated
- all core journeys pass platform-appropriate validation
- all permission-sensitive paths are validated
- integrations are validated for success and failure where relevant
- clean install/build/start are validated for selected mode
- launch validation tasks pass or have approved exceptions
- no orphaned feature modules remain
- docs/current state/decision log/board are updated
- human final acceptance is obtained where required

## No Coding Until
Do not start implementation until:
- source docs meet Definition Of Ready
- board plan is compiled
- board approval status is `approved`
- must-have requirements map to tasks and validation
- core journeys map to tasks and validation
- launch readiness tasks exist
- ready tasks have complete contracts
- assumptions needing human review are resolved or explicitly accepted

## Orphan Detection Gate
Before launch, verify:
- every route/page is reachable through expected navigation or direct documented URL
- every new component is used or intentionally exported
- every API/service is called or covered by tests
- every data entity has schema/model and relevant validation
- every must requirement has implementation and validation
- every E2E test maps to a journey
- no duplicate independent app shell exists unless intentionally architected

## Success Gate By Mode
### Mockup
- Screens/flows reflect approved UX direction
- Human can click or inspect intended flow
- Known fake data/mocks are documented

### Prototype
- Prototype goal is demonstrably validated
- Critical technical or interaction risk is answered
- Shortcuts and throwaway parts are documented

### MVP
- Real users can complete in-scope journeys
- Real data is handled for core flows
- Required tests and E2E journeys pass
- Launch/run instructions work
- Known gaps are accepted

### Production
- Full launch validation passes
- Security/privacy/permission checks pass
- Rollback/recovery/runbook expectations are satisfied
- Monitoring/support expectations are met
- Deployment requires explicit human approval

## Coverage Failure Handling
If coverage is missing:
1. Add missing tasks or validation tasks.
2. Link them to the relevant source IDs.
3. Mark affected implementation tasks `review` or `blocked` if needed.
4. Do not approve board or launch until coverage is restored.

## Final Acceptance Checklist
Before final handoff, confirm:
- board shows no blocking assumptions
- board shows no missing dependency references
- ready/done tasks have contracts and validation proof
- launch validation is complete
- current state summarizes real status
- decision log records important deviations
- human knows how to run and review the app

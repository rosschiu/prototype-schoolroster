# Execution Runbook

- Human Action: REVIEW AND CHANGE
- Status: Draft
- Owner: Framework default, human approved
- Inputs: Approved board plan in `project/index.html`, `docs/05-agent-workflow.md`, `docs/12-coverage-and-success-gates.md`, source docs `00`-`04`
- Owns: Step-by-step instructions for a coding agent to execute the approved board plan end to end
- Must Not Repeat: Full task payloads, app requirements, or source doc content
- Update Trigger: Change in execution model, board schema, quality gates, harness capability, or failure recovery process
- Mode Applicability: Prototype / MVP / Production; lightweight for Mockup

## Purpose
Give a coding agent a practical loop to complete an app from the approved board plan, even with a primitive harness.

The agent should execute the board plan, validate continuously, recover from failures, and stop only when required by approval boundaries or blockers.

## Preflight Gate
Before coding, confirm:
- source docs are ready
- board approval status is `approved`
- no blocking assumptions apply
- launch validation exists
- task hierarchy is valid
- ready tasks have contracts and quality gates
- local setup instructions are known or represented as a task

If any item fails, do not code. Fix the plan or ask human.

## Default Execution Loop
Repeat until all approved tasks are done or explicitly deferred:

1. Select the next ready item whose dependencies are satisfied.
2. Read the task contract and linked source IDs summarized in the task.
3. Inspect existing files listed in owned paths and allowed touch points.
4. Implement only the task scope.
5. Wire the work through the declared integration surface.
6. Run the task quality gate.
7. Fix failures.
8. Run affected integration checks if the task crosses app boundaries.
9. Review the change for integration, regressions, security, and missing tests.
10. Update board status, files touched, tests run, and handoff notes.
11. Continue to the next ready item.

## Primitive Harness Mode
Use this when the agent cannot safely run subagents, parallel tasks, browser tools, or rich automation.

Rules:
- Work sequentially.
- Do not run parallel edits.
- Prefer one task at a time.
- Avoid broad refactors.
- Use simple shell commands for validation.
- Keep a running execution note in current state or board handoff fields.
- If browser E2E cannot be run, create the test and document that execution is blocked by harness limits.
- Do not claim validation passed unless it actually ran.

Recommended sequence:
1. Foundation/setup tasks
2. Data/schema tasks
3. Auth/permission foundation
4. Services/API tasks
5. UI route/component tasks
6. Integration tasks
7. Validation tasks
8. Launch readiness tasks

## Wave Completion Gate
A wave is complete only when:
- all implementation tasks in the wave are done or approved deferred
- integration tasks are done
- wave validation tasks pass
- app builds/compiles where relevant
- app starts or affected routes load where relevant
- no critical regression is open
- board/current state are updated

Do not move to the next dependent wave if the current wave gate fails.

## Task Review Checklist
Before marking a task done, check:
- code lives in planned owned paths or documented touch points
- declared integration surface is wired
- input/output contracts are satisfied
- permissions/security requirements are respected
- empty/loading/error states are handled if relevant
- tests/checks ran and passed, or blocker is documented
- no unrelated files were changed
- no duplicate standalone app shell was created
- handoff notes are updated

## Failure Recovery Protocols

### Build Or Typecheck Failure
1. Read the first actionable error.
2. Fix the smallest root cause.
3. Rerun the same command.
4. Repeat until pass or blocker is identified.
5. Do not skip the check unless human approves or mode allows documented exception.

### Test Failure
1. Identify whether the failure is from new code, old code, flaky test, or missing setup.
2. Fix product code if behavior is wrong.
3. Fix test only if test expectation is wrong or setup is incomplete.
4. Add missing fixture/seed data if needed.
5. Rerun targeted test, then affected suite.

### E2E Failure
1. Check app starts.
2. Check selectors/routes/test users are valid.
3. Verify the user journey manually if possible.
4. Fix app behavior before weakening the test.
5. Capture trace/screenshot/log if available.
6. Document harness limitations if E2E cannot run.

### Dependency Install Failure
1. Confirm package manager and lockfile.
2. Do not switch package manager without approval.
3. Avoid adding new dependencies unless approved.
4. If a dependency is unavailable, stop and ask unless a safe existing alternative is obvious.

### Missing Requirement Detail
1. Search task contract and source docs.
2. If still unclear, record a blocking assumption.
3. Stop and ask if it affects scope, UX, data, security, or release behavior.
4. Do not guess core behavior.

### Integration Regression
1. Identify the upstream task or shared surface.
2. Fix integration in the smallest common layer.
3. Rerun affected tests.
4. Add regression test if missing.
5. Update board handoff notes.

## Orphan Detection Before Launch
Before launch validation, check for orphaned work:
- UI pages not reachable from navigation or routes
- components not imported or used
- APIs not called by UI or tests
- services not used by routes/APIs/jobs
- data models with no migration/seed/test
- requirements without validation
- validation tests not linked to requirements/journeys
- duplicate app shells or separate mini-apps

If orphaned work exists, create or execute integration tasks before launch.

## Clean Room Launch Test
For launchable apps, perform a clean-room test when feasible:
1. copy or clone repo to a temporary location
2. install dependencies from lockfile
3. configure environment from documented example
4. run migrations/seed if applicable
5. run build/package
6. start app from documented command
7. run required tests and platform E2E
8. verify core journeys

If not feasible, document why and run the closest available substitute.

## Completion Standard
The app is complete only when:
- all approved tasks are done or explicitly deferred with approval
- all integration tasks are done
- all required validation tasks pass or have approved exceptions
- clean install/build/start are validated for the selected mode
- all must-have user journeys pass
- all must-have requirements have validation proof
- permission/security checks pass where relevant
- board/current state/decision log are updated
- final report lists changes, tests, risks, and follow-ups

## Final Report Format
At completion, report:
- completed epics/waves/tasks
- deferred items and approvals
- files changed summary
- commands/tests run
- E2E/launch validation results
- known risks or gaps
- how to run the app
- whether human final acceptance or deployment approval is needed

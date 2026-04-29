# AI Coding Project Framework

This repo is a human-agent development framework for building apps with deep up-front specification, then executing implementation in a controlled way.

## What This Repo Contains
- `docs/` - the project specification, delivery rules, and operating memory
- `project/index.html` - local graphical task board with embedded JSON

## Start Here
For a new project:
1. Fill `docs/00-project-charter.md`
2. Fill `docs/01-scope-and-mode.md`
3. Let AI draft the `REVIEW AND CHANGE` docs
4. Review and refine the draft docs until the build contract is clear
5. Use `project/index.html` to plan and track execution

## Human Action Legend
- `YES` - human is expected to actively provide or decide content
- `REVIEW AND CHANGE` - AI drafts first; human reviews and adjusts
- `OPTIONAL` - only use when relevant
- `NO` - mainly AI-maintained; human checks only when needed

## Core Docs
- `docs/00-project-charter.md` - app context
- `docs/01-scope-and-mode.md` - current app mode and scope boundary
- `docs/02-product-requirements.md` - features and behavior
- `docs/03-personas-and-flows.md` - user flows and usage context
- `docs/04-ux-ui-direction.md` - UX/UI direction
- `docs/05-design-system-and-theming.md` - component and theming rules
- `docs/06-domain-model.md` - entities and data rules
- `docs/07-technical-architecture.md` - solution structure
- `docs/08-integrations.md` - external/internal system contracts
- `docs/09-security-privacy-compliance.md` - obligations and controls
- `docs/10-engineering-quality.md` - mode-driven SDLC profile
- `docs/11-delivery-and-operations.md` - release/runtime model
- `docs/12-human-agent-workflow.md` - detailed collaboration reference
- `docs/13-current-state.md` - AI-maintained current snapshot
- `docs/14-decision-log.md` - AI-maintained decision history

## Extension Docs
- `docs/15-risk-register.md`
- `docs/16-permissions-matrix.md`
- `docs/17-api-contracts.md`
- `docs/18-test-strategy.md`
- `docs/19-release-runbook.md`

## Execution Workflow
The project runs in 3 macro phases.

### Phase 1 - Spec
1. Project creation
2. Intent lock
3. Product and UX definition
4. Solution definition

### Phase 2 - Build
5. Execution planning
6. Implementation waves
7. Integration and convergence
8. Scenario validation

### Phase 3 - Ship
9. Release readiness
10. Deployment
11. Post-deploy stabilization

## Local Task Board
- Open `project/index.html` directly in a browser
- The task data is embedded in the same file
- Humans use it as the visual execution interface
- Agents can update the embedded JSON as the project evolves

## Local Postgres 18 Runtime
This prototype is now expected to run against the existing Docker Postgres 18 container named `pglocal`.

- Container: `pglocal`
- Image: `postgres:18-alpine`
- Local URL: `postgres://nexus:nexus@127.0.0.1:5432/nexus2`
- Default app schema for local dev: `schoolroster_dev`
- Validation schema: `schoolroster_val18`

Useful commands:

```bash
npm run dev:api:pglocal
npm run dev:web
npm run test:api:pglocal
npm run validate:pglocal
```

`validate:pglocal` runs the API tests with `DATABASE_URL`, restarts the API, and writes persistence evidence to `output/val-018-pglocal-evidence.json`.

## For Coding Agents
Read `AGENTS.md` first. That file is the operational contract for agent behavior in this repo.

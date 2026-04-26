# Human Interview Guide

- Human Action: REVIEW AND CHANGE
- Status: Draft
- Owner: Framework default, human adjustable
- Inputs: `docs/00-app-definition.md`, `docs/01-product-and-ux.md`, `docs/02-system-design.md`, `docs/03-safety-and-permissions.md`, `docs/04-quality-and-release.md`
- Owns: How an AI agent guides a layman human to provide enough detail for the source docs
- Must Not Repeat: Final app requirements, architecture decisions, or task board details
- Update Trigger: Change in human intake process, required source docs, mode selection, or approval workflow
- Mode Applicability: Any

## Purpose
Help even a weak agent interview a non-technical human and turn answers into usable source docs.

The agent should not ask the human to fill templates manually. The agent should ask plain-language questions, summarize answers, state assumptions, and write the docs.

## Interview Rules For Agents
- Ask one small group of questions at a time.
- Prefer plain language over jargon.
- Explain technical terms before using them.
- Offer concrete choices when the human seems unsure.
- Summarize back decisions before writing them into docs.
- Separate facts, assumptions, and recommendations.
- Do not treat silence as approval for important scope, security, data, or release decisions.
- If the human gives vague answers, ask for examples.
- If the human says “you decide,” record the decision as an assumption and mark it safe / needs human / blocks work.
- Do not start board compilation until the source docs are testable enough to create tasks and validation.

## Interview Output
After each interview phase, the agent should produce:
- short summary of what was learned
- assumptions made
- open questions
- docs/sections updated
- whether the project can proceed to the next phase

## Phase 1 - App Idea And First Useful Version
Goal: fill `docs/00-app-definition.md` enough to select mode and scope.

Ask:
1. What is the app idea in one or two sentences?
2. Who will use it first?
3. What problem does it solve for them?
4. What is the smallest version that would be useful?
5. What should definitely not be included in the first version?
6. Is this mainly a mockup, prototype, MVP, or production app?
7. Does the app need real login, real saved data, or can those be fake for now?
8. What would make you say “this worked” at the end?

If the human is unsure about mode, offer:
- Mockup: clickable/look-and-feel only, fake data is fine.
- Prototype: prove a workflow or technical idea, some rough edges are fine.
- MVP: real users can complete real workflows with real data.
- Production: reliable, secure, supportable, ready for ongoing use.

Write/update:
- `docs/00-app-definition.md`

Stop if:
- scope is too vague to list in-scope and out-of-scope items
- mode cannot be selected
- real vs mocked decisions are unclear for core flows

## Phase 2 - Users And Journeys
Goal: fill personas, requirements, and journeys in `docs/01-product-and-ux.md`.

Ask:
1. What types of users are there?
2. What does each user need to accomplish?
3. Walk me through the most important user journey from start to finish.
4. What should happen when there is no data yet?
5. What can go wrong, and what should the app show?
6. What actions should be easy or prominent?
7. What should users never be able to do by accident?
8. Are there admin/owner/moderator users?

For each journey, collect:
- persona
- trigger
- preconditions
- main steps
- success state
- empty/loading/error states
- permissions/security notes

Write/update:
- `docs/01-product-and-ux.md`

Stop if:
- core journeys cannot be described step by step
- must-have requirements are not testable
- user roles affect behavior but are undefined

## Phase 3 - Screens, Content, And UX Direction
Goal: make UX specific enough to avoid generic or disconnected UI.

Ask:
1. What screens/pages do you expect?
2. What should be on the home/dashboard screen?
3. What forms are needed?
4. What lists/tables/cards are needed?
5. What does a detail page show?
6. Should it feel formal, playful, premium, utilitarian, bold, calm, etc.?
7. Any brand colors, examples, or apps you like/dislike?
8. What devices matter most: desktop, mobile, tablet?

Write/update:
- `docs/01-product-and-ux.md`

Stop if:
- there is no screen/state inventory for core journeys
- responsive/device expectations are unknown for the selected mode

## Phase 4 - Data, Architecture, And Integrations
Goal: fill `docs/02-system-design.md` enough for board tasks to know what code surfaces to create.

Ask in plain language:
1. What information does the app need to remember?
2. What are the main things in the app? Example: users, projects, orders, messages.
3. Where does data come from?
4. Does the app connect to any outside services?
5. Does it send emails, notifications, payments, AI calls, imports, exports, or reports?
6. Does it need an admin area?
7. Is there an existing system, database, codebase, or API it must work with?
8. Are there important limits, like many users, large files, or real-time updates?

Translate answers into:
- domain model
- data model
- API/contract inventory
- integration inventory
- service/module boundaries

Write/update:
- `docs/02-system-design.md`

Stop if:
- core data entities are unclear
- required integrations are unknown
- persistence requirements conflict with mode/scope

## Phase 5 - Safety, Login, Permissions, Privacy
Goal: fill `docs/03-safety-and-permissions.md`.

Ask:
1. Does anyone need to log in?
2. Are there different user types with different access?
3. What data is private or sensitive?
4. Who can view, create, edit, or delete each main thing?
5. Is there any data the app must never expose to the wrong user?
6. Are there legal/privacy requirements?
7. Should actions be logged or auditable?
8. What abuse or misuse worries you?

Write/update:
- `docs/03-safety-and-permissions.md`

Stop if:
- auth is required but unspecified
- roles/permissions affect core behavior but are undefined
- sensitive data exists without access rules

## Phase 6 - Quality, Testing, And Launch
Goal: fill `docs/04-quality-and-release.md` enough to validate the finished app.

Ask:
1. How reliable does this need to be?
2. Who will use the first version?
3. What must be tested before you trust it?
4. For a web app, should we run browser tests for the main journeys?
5. How should someone install, run, test, and launch it?
6. What environment variables or accounts are needed?
7. Does deployment matter now, or only local launch?
8. What would be an unacceptable failure after launch?

Default recommendations:
- Web MVP/Production: include Playwright E2E for core journeys.
- Data apps: include migration/seed validation.
- Auth apps: include permission tests.
- Integration apps: include contract/failure tests.
- Any launchable app: include clean install, build, start, and smoke validation.

Write/update:
- `docs/04-quality-and-release.md`

Stop if:
- no launch validation can be defined
- test strategy is too vague to generate validation tasks

## Phase 7 - Approval Summary
Before board compilation, summarize:
- app purpose
- selected mode
- in scope / out of scope
- core users
- core journeys
- core screens
- data entities
- integrations
- roles/permissions
- quality/release expectations
- assumptions
- blockers

Ask the human:
1. Is this the app you want planned?
2. Are any must-have journeys missing?
3. Are any assumptions wrong?
4. Can I compile the implementation board from this?

Do not compile the board until the human approves or no blocking questions remain.

## Assumption Labels
Use only these labels for layman-friendly review:
- `safe` - reasonable default with low impact
- `needs human` - human should confirm before board approval
- `blocks work` - cannot continue safely without an answer

## Good Question Patterns
Use:
- “What should happen when...?”
- “Who is allowed to...?”
- “What is the first version that is useful?”
- “Can this be fake for now, or must it be real?”
- “How will we know this works?”

Avoid:
- “Define the domain model.”
- “Specify API contracts.”
- “What is your RBAC matrix?”
- “What is your SDLC quality bar?”

Translate technical needs into plain questions, then write the technical doc sections yourself.

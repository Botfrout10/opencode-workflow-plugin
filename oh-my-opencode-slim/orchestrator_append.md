## Universal Workflow (symphony-workflow)

This is my standard workflow on EVERY project. Drive it as the orchestrator; do not push the whole workflow onto subagents — give them only their task plus the relevant project conventions.

### 1. Context
- At session start, read `PROJECT.md` (fallback `README.md` / `AGENTS.md`). If none exists, ask the user for the spec or state your understanding before coding.

### 2. Setup gate
- If the project is not initialized (no `.git`, no `AGENTS.md`, or no test runner), run `/init-project` first. It scaffolds the stack, creates `AGENTS.md` + `DESIGN.md`, inits git, and sets up vitest.

### 3. Plan (before coding)
- Enter built-in **plan mode**: draft a concise plan, then **wait for the user's approval** before implementing. Do not start the code loop until approved.

### 4. Coding loop (per change)
1. Implement the change.
2. Run LSP diagnostics and fix all errors/warnings.
3. **Always write tests** for new behavior, then run them.
4. **Format + lint + typecheck** (the verify-before-commit step) so the committed state is clean.
5. Let the auto-commit hook record the diff after the turn.
6. Run **build** to verify integrity before reporting done.

### 5. Summary
- End with a concise summary: what changed, why, and the verification result (tests/typecheck/build).

### Delegation rule
- When spawning subagents (fixer, explorer, designer, librarian, …), pass only the specific task and the relevant project conventions pulled from `AGENTS.md` / `PROJECT.md`. Never paste this whole workflow into their briefs.

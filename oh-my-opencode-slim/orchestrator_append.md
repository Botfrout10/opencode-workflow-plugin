## Universal Workflow (symphony-workflow)

You are the orchestrator. You coordinate work and delegate to specialist subagents; you do not implement everything yourself. Hand specialized work to subagents and only do trivial one-liners directly.

### 1. Context
- At session start, read `PROJECT.md` (fallback `README.md` / `AGENTS.md`). If none exists, ask the user for the spec or state your understanding before coding.
- For codebase discovery (finding files, symbols, patterns), delegate to **@explorer** rather than searching yourself.

### 2. Setup gate
- If the project is not initialized (no `.git`, no `AGENTS.md`, or no test runner), run `/init-project` first. It scaffolds the stack, creates `AGENTS.md` + `DESIGN.md`, inits git, and sets up vitest.

### 3. Plan (before coding)
- Spawn the built-in **plan** subagent to analyze the request and produce a plan:
  `task({ subagent_type: "plan", prompt: "Analyze <request> and write a concise implementation plan to .opencode/plans/<name>.md" })`
- The plan agent is read-only and writes its plan to `.opencode/plans/*.md`. Read it back, then **wait for the user's approval** before implementing. Do not start the code loop until approved.

### 4. Coding loop (per change)
Delegate implementation to subagents; do not code it yourself unless it is a trivial one-liner.
- Main implementation / new features / multi-file changes → **@coder** (follows TDD, runs bun verification).
- Quick bounded fixes / one-line edits → **@fixer**.
- UI/UX, layout, visual polish → **@designer**.
- External docs, library APIs, research → **@librarian** (with context7).
- Architecture, risky refactors, debugging, review → **@oracle**.
- After implementation, let the auto-commit hook record the diff after the turn.
- Run **build** (via the coding subagent) to verify integrity before reporting done.

Use **bun** for all package/script commands: `bun install`, `bun run typecheck`, `bun run test`, `bun run build`.

### 5. Summary
- End with a concise summary: what changed, why, and the verification result (tests/typecheck/build).

### Delegation rule
- When spawning subagents, pass only the specific task and the relevant project conventions pulled from `AGENTS.md` / `PROJECT.md`. Never paste this whole workflow into their briefs.
- Subagent routing:
  - **@explorer** — codebase discovery, locating files/symbols/patterns.
  - **@librarian** — external docs, library APIs, web research (context7).
  - **@designer** — UI/UX, visual design, responsive layout, polish.
  - **@coder** — main implementation loop (TDD, bun verify). Not for one-liners.
  - **@fixer** — quick bounded fixes, one-line edits.
  - **@oracle** — architecture, risky refactors, debugging, code review.
  - **@plan** — read-only planning/analysis (spawned for the Plan step).

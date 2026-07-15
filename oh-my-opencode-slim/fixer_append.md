## Fixer Execution Notes

- You receive a focused task brief from the orchestrator, not the full workflow.
- You handle QUICK, BOUNDED fixes and one-line edits. For the main implementation loop (new features, multi-file TDD work), the orchestrator delegates to **@coder** instead.
- Before reporting done: run the project's verification commands with bun (e.g. `bun run typecheck`, `bun run test`) and resolve any failures.
- Do not commit — the auto-commit hook handles commits after each turn.
- If you are unsure about a library API, ask the orchestrator to route to @librarian + context7 rather than guessing.

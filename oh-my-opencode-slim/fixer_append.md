## Fixer Execution Notes

- You receive a focused task brief from the orchestrator, not the full workflow.
- Before reporting done: run the project's verification commands (e.g. `npm run typecheck`, `npm run test`) and resolve any failures.
- Do not commit — the auto-commit hook handles commits after each turn.
- If you are unsure about a library API, ask the orchestrator to route to librarian + context7 rather than guessing.

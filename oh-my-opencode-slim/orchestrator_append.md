## End-of-Turn Commit Message

This workflow auto-commits your changes after each turn (gated on a green tree). To make those commits meaningful, write a one-phrase commit message at the end of any turn where you changed, created, or deleted files.

- Compute the repo root: `git rev-parse --show-toplevel`.
- Write the message to `<repo-root>/.git/OC_COMMIT_MSG` (plain text, single line, UTF-8).
- Format: conventional-commit style, ONE short phrase, lowercase type, no trailing period.
  - `fix: correct invalid mode key in coder agent`
  - `feat: add diff-based commit message generator`
  - `refactor: split auto-commit logic into a shared helper`
  - `docs: document the commit-message convention`
- Be specific: name the file / area / behavior that the diff actually contains. Do not write generic text like "update files" or "changes".
- If you made NO file changes this turn, do not write the file.
- Do NOT run `git commit` yourself — the auto-commit hook reads this file and commits for you.

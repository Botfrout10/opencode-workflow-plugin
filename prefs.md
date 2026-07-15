# Environment Preferences (global — applies to every project)

- **Package manager: always use bun.** Never npm/yarn/pnpm.
  - Install deps: `bun install`
  - Run scripts: `bun run <script>` (e.g. `bun run dev`, `bun run build`, `bun run typecheck`, `bun run test`)
  - Run packages: `bunx <pkg>` (not `npx`)
  - Scaffold: `bun create <template>` / `bunx create-<stack>@latest`
- **Installing CLI tools / system software: use winget.**
  - e.g. `winget install <PackageIdentifier>` — prefer winget over npm/npx for global CLI installs.
- These apply regardless of project stack.

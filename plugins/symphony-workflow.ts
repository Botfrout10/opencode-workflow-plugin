import { type Plugin, tool } from "@opencode-ai/plugin"
import { join } from "node:path"

export const SymphonyWorkflow: Plugin = async (ctx) => {
  const root = ctx.directory

  async function readText(p: string): Promise<string | null> {
    try {
      const f = Bun.file(p)
      if (await f.exists()) return await f.text()
    } catch {}
    return null
  }
  async function writeText(p: string, content: string) {
    await Bun.write(p, content)
  }
  async function exists(p: string): Promise<boolean> {
    return await Bun.file(p).exists()
  }
  async function shell(cmd: string): Promise<string> {
    return await ctx.$`${cmd}`.nothrow().quiet().text()
  }

  function detectStack(spec: string | null, override?: string): string {
    if (override) return override.toLowerCase()
    if (!spec) return "generic"
    const s = spec.toLowerCase()
    if (s.includes("next")) return "next"
    if (s.includes("svelte")) return "svelte"
    if (s.includes("vite") && s.includes("react")) return "vite-react"
    if (s.includes("react")) return "react"
    if (s.includes("fastify") || s.includes("express") || s.includes("node")) return "node"
    return "generic"
  }

  async function scaffold(stack: string) {
    const projectMd = join(root, "PROJECT.md")
    const hadProjectMd = await exists(projectMd)
    // Official scaffolders refuse non-empty dirs; stash PROJECT.md so they can run.
    if (hadProjectMd) await shell(`mv PROJECT.md ._project_md_tmp`)
    try {
      if (stack === "next") {
        await ctx.$`bunx create-next-app@latest . --ts --app --eslint --tailwind --src-dir --import-alias "@/*" --use-bun --yes`.nothrow().quiet()
      } else if (stack === "vite-react" || stack === "react") {
        await ctx.$`bunx create-vite@latest . --template react-ts`.nothrow().quiet()
      } else if (stack === "svelte") {
        await ctx.$`bunx create-vite@latest . --template svelte-ts`.nothrow().quiet()
      } else {
        await manualStructure()
      }
    } finally {
      if (hadProjectMd) await shell(`mv ._project_md_tmp PROJECT.md`)
    }
  }

  async function manualStructure() {
    if (!(await exists(join(root, "package.json")))) {
      await writeText(join(root, "package.json"), JSON.stringify({
        name: "project",
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: { dev: "echo dev", build: "echo build", typecheck: "tsc --noEmit", test: "vitest run" },
      }, null, 2))
    }
    if (!(await exists(join(root, "src")))) {
      await ctx.$`mkdir -p src`.quiet()
      await writeText(join(root, "src", "index.ts"), "// entry point\nexport function main() {}\n")
    }
    if (!(await exists(join(root, "tsconfig.json")))) {
      await writeText(join(root, "tsconfig.json"), JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, noEmit: true },
        include: ["src"],
      }, null, 2))
    }
  }

  async function ensureGit(): Promise<string> {
    const top = (await shell(`git rev-parse --show-toplevel 2>nul`)).trim()
    const normalizedRoot = root.replace(/\/+$/, "")
    if (top && top !== normalizedRoot) {
      // Inside another repo (e.g. the outer dotfiles repo) -> never init here.
      return "skipped (inside outer repo)"
    }
    if (top === normalizedRoot) return "already a repo"
    await ctx.$`git init`.quiet().nothrow()
    await writeText(join(root, ".gitignore"), [
      "node_modules/", "dist/", ".opencode/", "*.db", "*.db-wal", "*.db-shm", "workspaces/",
    ].join("\n") + "\n")
    return "initialized"
  }

  async function ensureVitest() {
    const pkgPath = join(root, "package.json")
    let pkg: any = {}
    if (await exists(pkgPath)) {
      try { pkg = JSON.parse((await readText(pkgPath)) || "{}") } catch {}
    }
    pkg.devDependencies = pkg.devDependencies || {}
    pkg.devDependencies.vitest = pkg.devDependencies.vitest || "^3.0.0"
    pkg.scripts = pkg.scripts || {}
    pkg.scripts.test = pkg.scripts.test || "vitest run"
    pkg.scripts["test:watch"] = pkg.scripts["test:watch"] || "vitest"
    await writeText(pkgPath, JSON.stringify(pkg, null, 2))
    if (!(await exists(join(root, "vitest.config.ts")))) {
      await writeText(join(root, "vitest.config.ts"),
`import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // For node:sqlite servers, run with: vitest run --experimental-sqlite
  },
})
`)
    }
    const testDir = join(root, "test")
    if (!(await exists(join(testDir, "smoke.test.ts")))) {
      await ctx.$`mkdir -p test`.quiet()
      await writeText(join(testDir, "smoke.test.ts"),
`import { describe, it, expect } from "vitest"

describe("smoke", () => {
  it("works", () => {
    expect(1 + 1).toBe(2)
  })
})
`)
    }
  }

  async function verifyGreen(dir: string): Promise<boolean> {
    const pkgPath = join(dir, "package.json")
    if (!(await exists(pkgPath))) return true
    let pkg: any = {}
    try {
      pkg = JSON.parse((await readText(pkgPath)) || "{}")
    } catch {
      return true
    }
    const scripts = pkg.scripts || {}
    for (const script of ["typecheck", "test"]) {
      if (!scripts[script]) continue
      try {
        const res = await ctx.$`bun run ${script}`.nothrow().quiet()
        if (res.exitCode !== 0) return false
      } catch {
        return false
      }
    }
    return true
  }

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      const dir = ctx.directory
      const top = (await ctx.$`git -C ${dir} rev-parse --show-toplevel`.nothrow().quiet().text()).trim()
      if (!top) return
      if (top === "C:/Users/mehdi") return
      const status = (await ctx.$`git -C ${dir} status --porcelain`.nothrow().quiet().text()).trim()
      if (!status) return
      // Gate: only commit a green tree. Run project verification if scripts exist.
      if (!(await verifyGreen(dir))) return
      const ts = new Date().toISOString().slice(0, 16).replace("T", " ")
      await ctx.$`git -C ${dir} add -A`.nothrow()
      await ctx.$`git -C ${dir} commit -m ${`chore: opencode changes (${ts})`}`.nothrow()
    },
    tool: {
      symphony_init: tool({
        description:
          "Scaffold a new project: detect stack from PROJECT.md, run the official scaffolder (or generate a structure), create AGENTS.md and DESIGN.md, git init, and set up the vitest test runner.",
        args: {
          stack: tool.schema
            .string()
            .optional()
            .describe("Override detected stack: next | vite-react | react | svelte | node | generic"),
        },
        async execute(args) {
          const spec = await readText(join(root, "PROJECT.md"))
          const stack = detectStack(spec, args.stack)
          const steps: string[] = []
          await scaffold(stack)
          steps.push(`scaffold: ${stack}`)
          steps.push(`git: ${await ensureGit()}`)
          await ensureVitest()
          steps.push("vitest: configured")
          await ctx.$`bun install`.nothrow().quiet()
          steps.push("deps: npm install")
          return [
            "## symphony_init complete",
            ...steps.map((s) => `- ${s}`),
            "",
            "Next: generate AGENTS.md and DESIGN.md with real content (the agent does this), then start coding. Commits are auto-created after each turn.",
          ].join("\n")
        },
      }),
    },
    config: async (config) => {
      config.command = config.command || {}
      config.command["init-project"] = {
        description: "Scaffold project (stack-aware) + AGENTS.md/DESIGN.md + git + tests",
        template:
          "Initialize this project with the symphony_init tool: read PROJECT.md for the stack, scaffold it (run the official scaffolder for known stacks or generate a structure), git init, and set up the test runner. Use bun for all package operations (bun install, bun run). Then, based on PROJECT.md and the scaffolded project, WRITE complete, project-specific content into AGENTS.md (stack, commands using bun, conventions, delegation notes) and DESIGN.md (overview, architecture, data model, UI/UX direction, key decisions). Do NOT leave placeholder comments — generate real content. Report what was created.",
        subtask: false,
      }
    },
  }
}

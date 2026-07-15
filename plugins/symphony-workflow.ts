import { type Plugin, tool } from "@opencode-ai/plugin"
import { join } from "node:path"
import { readdir } from "node:fs"

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

  type Stack = "next" | "vite-react" | "react" | "svelte" | "node" | "rust" | "python" | "dotnet" | "go" | "java" | "ruby" | "generic"

  function isNodeFamily(stack: Stack): boolean {
    return stack === "next" || stack === "vite-react" || stack === "react" || stack === "svelte" || stack === "node"
  }

  function detectStack(spec: string | null, override?: string): Stack {
    if (override) {
      const o = override.toLowerCase()
      if (["next", "vite-react", "react", "svelte", "node", "rust", "python", "dotnet", "go", "java", "ruby"].includes(o)) return o as Stack
      if (o.includes("next")) return "next"
      if (o.includes("svelte")) return "svelte"
      if (o.includes("vite") && o.includes("react")) return "vite-react"
      if (o.includes("react")) return "react"
      if (o.includes("rust") || o.includes("cargo")) return "rust"
      if (o.includes("python")) return "python"
      if (o.includes("dotnet") || o.includes("c#") || o.includes(".net")) return "dotnet"
      if (o.includes("golang")) return "go"
      if (o.includes("java")) return "java"
      if (o.includes("ruby") || o.includes("rails")) return "ruby"
      if (o.includes("node") || o.includes("fastify") || o.includes("express")) return "node"
      return "generic"
    }
    if (!spec) return "generic"
    const s = spec.toLowerCase()
    if (s.includes("next")) return "next"
    if (s.includes("svelte")) return "svelte"
    if (s.includes("vite") && s.includes("react")) return "vite-react"
    if (s.includes("react")) return "react"
    if (s.includes("rust") || s.includes("cargo")) return "rust"
    if (s.includes("python")) return "python"
    if (s.includes("dotnet") || s.includes("c#") || s.includes(".net")) return "dotnet"
    if (s.includes("golang") || /\bgo\b/.test(s)) return "go"
    if (s.includes("java") && !s.includes("javascript") && !s.includes("typescript")) return "java"
    if (s.includes("ruby") || s.includes("rails")) return "ruby"
    if (s.includes("fastify") || s.includes("express") || s.includes("node")) return "node"
    return "generic"
  }

  async function hasAny(dir: string, names: string[]): Promise<boolean> {
    for (const n of names) if (await exists(join(dir, n))) return true
    return false
  }
  async function hasExt(dir: string, ext: string): Promise<boolean> {
    try {
      const entries = await readdir(dir)
      return entries.some((e) => e.toLowerCase().endsWith(ext))
    } catch {
      return false
    }
  }

  // Manifest-first stack detection (reliable); falls back to PROJECT.md text.
  async function detectProjectStack(dir: string): Promise<Stack> {
    if (await exists(join(dir, "Cargo.toml"))) return "rust"
    if (await exists(join(dir, "go.mod"))) return "go"
    if (await hasAny(dir, ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg"])) return "python"
    if (await hasAny(dir, ["pom.xml", "build.gradle", "build.gradle.kts"])) return "java"
    if (await hasExt(dir, ".csproj") || await hasExt(dir, ".sln") || await hasExt(dir, ".fsproj")) return "dotnet"
    if (await exists(join(dir, "Gemfile"))) return "ruby"
    if (await exists(join(dir, "package.json"))) {
      const fw = detectStack(await readText(join(dir, "PROJECT.md")))
      return isNodeFamily(fw) ? fw : "node"
    }
    return detectStack(await readText(join(dir, "PROJECT.md")))
  }

  async function scaffold(stack: Stack) {
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

  // Scaffold a minimal, language-appropriate project for non-Node stacks.
  // Never creates a package.json / runs bun — the agent uses the real toolchain.
  async function scaffoldNonNode(stack: Stack) {
    if (stack === "rust") {
      if (!(await exists(join(root, "Cargo.toml")))) {
        await writeText(join(root, "Cargo.toml"),
          `[package]\nname = "project"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`)
        await ctx.$`mkdir -p src`.quiet().nothrow()
        await writeText(join(root, "src", "main.rs"), "fn main() {\n    println!(\"hello\");\n}\n")
      }
    } else if (stack === "python") {
      if (!(await exists(join(root, "pyproject.toml")))) {
        await writeText(join(root, "pyproject.toml"),
          `[project]\nname = "project"\nversion = "0.1.0"\nrequires-python = ">=3.10"\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n`)
        await ctx.$`mkdir -p tests`.quiet().nothrow()
        await writeText(join(root, "tests", "test_smoke.py"), "def test_smoke():\n    assert 1 + 1 == 2\n")
      }
    } else if (stack === "go") {
      if (!(await exists(join(root, "go.mod")))) {
        await ctx.$`go mod init project`.nothrow().quiet()
        await writeText(join(root, "main.go"), "package main\n\nfunc main() {}\n")
      }
    }
    // dotnet / java / ruby: no manifest forced; the agent sets up the toolchain.
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

  // Returns the shell commands that prove a project is "green" for its stack.
  // Empty array => nothing to verify (pass). Commands are only included when the
  // stack's manifest/toolchain is actually present, so fresh or unknown projects
  // are not blocked, and non-Node stacks use their own toolchain (cargo, pytest, …).
  async function verifyCommands(stack: Stack, dir: string): Promise<string[]> {
    switch (stack) {
      case "rust":
        return (await exists(join(dir, "Cargo.toml"))) ? ["cargo check", "cargo test"] : []
      case "go":
        return (await exists(join(dir, "go.mod"))) ? ["go vet ./...", "go test ./..."] : []
      case "python":
        return (await hasAny(dir, ["pyproject.toml", "requirements.txt", "setup.py"])) ? ["pytest"] : []
      case "dotnet":
        return (await hasExt(dir, ".csproj") || await hasExt(dir, ".sln")) ? ["dotnet test"] : []
      case "java":
        if (await exists(join(dir, "pom.xml"))) return ["mvn test"]
        if (await hasAny(dir, ["build.gradle", "build.gradle.kts"])) return ["gradle test"]
        return []
      case "ruby":
        return (await exists(join(dir, "Gemfile"))) ? ["bundle exec rspec"] : []
      case "node":
      case "next":
      case "vite-react":
      case "react":
      case "svelte": {
        const pkgPath = join(dir, "package.json")
        if (!(await exists(pkgPath))) return []
        let pkg: any = {}
        try { pkg = JSON.parse((await readText(pkgPath)) || "{}") } catch { return [] }
        const scripts = pkg.scripts || {}
        const cmds: string[] = []
        if (scripts.typecheck) cmds.push("bun run typecheck")
        if (scripts.test) cmds.push("bun run test")
        return cmds
      }
      default:
        return []
    }
  }

  async function verifyGreen(dir: string): Promise<boolean> {
    const stack = await detectProjectStack(dir)
    const cmds = await verifyCommands(stack, dir)
    for (const cmd of cmds) {
      try {
        const res = await ctx.$`${cmd}`.nothrow().quiet()
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
          const stack = await detectProjectStack(root)
          const steps: string[] = []
          if (isNodeFamily(stack)) {
            await scaffold(stack)
            steps.push(`scaffold: ${stack}`)
          } else if (stack === "generic") {
            steps.push("scaffold: skipped (no recognized stack — add your own toolchain)")
          } else {
            await scaffoldNonNode(stack)
            steps.push(`scaffold: ${stack}`)
          }
          steps.push(`git: ${await ensureGit()}`)
          if (isNodeFamily(stack)) {
            await ensureVitest()
            steps.push("vitest: configured")
            await ctx.$`bun install`.nothrow().quiet()
            steps.push("deps: bun install")
          } else {
            steps.push("deps: skipped (non-node stack — use your language's package manager)")
          }
          return [
            "## symphony_init complete",
            ...steps.map((s) => `- ${s}`),
            "",
            "Next: generate AGENTS.md and DESIGN.md with real content (the agent does this), then start coding. Commits are auto-created after each turn (gated on a green tree for the detected stack).",
          ].join("\n")
        },
      }),
    },
    config: async (config) => {
      config.command = config.command || {}
      config.command["init-project"] = {
        description: "Scaffold project (stack-aware) + AGENTS.md/DESIGN.md + git + tests",
        template:
          "Initialize this project with the symphony_init tool: detect the stack from existing manifests (Cargo.toml, go.mod, pyproject.toml, package.json, …) or PROJECT.md, then scaffold with the right toolchain (cargo / go / pytest / dotnet for non-Node stacks — do NOT force Node or run bun there). git init and set up the test runner for the detected stack. Then, based on PROJECT.md and the scaffolded project, WRITE complete, project-specific content into AGENTS.md (stack, commands for that stack's package manager and test runner, conventions, delegation notes) and DESIGN.md (overview, architecture, data model, UI/UX direction, key decisions). Do NOT leave placeholder comments — generate real content. Report what was created.",
        subtask: false,
      }
    },
  }
}

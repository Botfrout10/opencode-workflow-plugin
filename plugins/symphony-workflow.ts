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
    return await ctx.$(cmd).nothrow().quiet().text()
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
        await ctx.$`npx create-next-app@latest . --ts --app --eslint --tailwind --src-dir --import-alias "@/*" --use-npm --yes`.nothrow().quiet()
      } else if (stack === "vite-react" || stack === "react") {
        await ctx.$`npm create vite@latest . -- --template react-ts`.nothrow().quiet()
      } else if (stack === "svelte") {
        await ctx.$`npm create vite@latest . -- --template svelte-ts`.nothrow().quiet()
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

  async function writeProjectDocs(stack: string, spec: string | null) {
    if (!(await exists(join(root, "AGENTS.md")))) {
      await writeText(join(root, "AGENTS.md"),
`# AGENTS.md

Auto-generated by symphony-workflow init.

## Stack
${stack}${spec ? "\n\n## Project spec\nSee PROJECT.md" : ""}

## Commands
- dev: npm run dev
- build: npm run build
- typecheck: npm run typecheck
- test: npm run test

## Conventions
- Always write tests for new behavior.
- Run typecheck + tests before committing.
- Do not hand-edit generated build artifacts.
`)
    }
    if (!(await exists(join(root, "DESIGN.md")))) {
      await writeText(join(root, "DESIGN.md"),
`# DESIGN.md

## Overview
<!-- Describe what this project is for. -->

## Architecture
<!-- High-level components and data flow. -->

## Data Model
<!-- Entities, stores, schemas. -->

## UI / UX
<!-- Visual and interaction direction. -->

## Decisions
<!-- Notable trade-offs and why they were made. -->
`)
    }
  }

  return {
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
          await writeProjectDocs(stack, spec)
          steps.push("docs: AGENTS.md, DESIGN.md")
          await ensureVitest()
          steps.push("vitest: configured")
          await ctx.$`npm install`.nothrow().quiet()
          steps.push("deps: npm install")
          return [
            "## symphony_init complete",
            ...steps.map((s) => `- ${s}`),
            "",
            "Next: read AGENTS.md / DESIGN.md, then start coding. Commits are auto-created after each turn.",
          ].join("\n")
        },
      }),
    },
    config: async (config) => {
      config.command = config.command || {}
      config.command["init-project"] = {
        description: "Scaffold project (stack-aware) + AGENTS.md/DESIGN.md + git + tests",
        template:
          "Initialize this project with the symphony_init tool: read PROJECT.md for the stack, scaffold it (run the official scaffolder for known stacks or generate a structure), create AGENTS.md and DESIGN.md, git init, and set up the test runner. Report what was created.",
        agent: "build",
        subtask: false,
      }
    },
  }
}

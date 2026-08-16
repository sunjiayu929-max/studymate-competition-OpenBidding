# Project discovery

Use this procedure every time the skill enters a new repository. It replaces hard-coded project paths and framework assumptions.

## Resolve scope

1. Treat the directory containing `SKILL.md` as the skill directory.
2. Resolve the project root with `git rev-parse --show-toplevel` when inside a Git worktree.
3. If Git is unavailable, walk upward from the current working directory to the nearest project marker such as `package.json`, `pnpm-workspace.yaml`, `vite.config.*`, `next.config.*`, `.openai/hosting.json`, or `AGENTS.md`.
4. If no marker exists, use the current working directory and treat the project as new.
5. Never embed the discovered absolute path into the reusable skill files.

## Inspect before choosing tools

Inspect only what is needed to determine:

- repository instructions such as `AGENTS.md`;
- Git status and user-owned changes;
- package manager from lockfiles and `packageManager` metadata;
- framework and version from manifests and config;
- current routes, layout shell, styling system, icon family, and component conventions;
- image locations such as `public`, `assets`, `src/assets`, `static`, uploads, and user-provided external paths;
- available development, build, lint, test, and preview commands;
- hosting markers and project-specific deployment rules.

Use `rg --files` first for file discovery. Avoid broad dependency scans and generated folders.

## Preserve the project

- Reuse the current package manager, lockfile, framework, scripts, routes, and architecture.
- Install a dependency only when it solves a concrete gap and fits the existing stack.
- Prefer the installed icon family and code-native effects.
- Do not replace an application shell, starter, or working component library merely to use familiar code.
- Preserve unrelated edits and external source images.
- Copy external user assets into an appropriate project asset directory only when implementation requires it; never move or overwrite the source.

## Select the execution path

### Existing project

Work inside its established structure. Inspect the smallest set of files that controls the requested page, global type, styling, and metadata.

### New or empty project

Use the environment's supported site initializer or existing hosting workflow. Choose the smallest architecture that satisfies the request. Do not force Next.js, React, Tailwind, or any other framework when the environment already provides a different supported path.

### Sites-managed project

When `.openai/hosting.json` exists, use the available Sites building workflow for implementation and Sites hosting only when publishing is authorized. The visual-first skill owns art direction; the Sites skills own environment-specific building and hosting contracts.

## Capture a local execution note

Before implementation, know the answers to these questions without asking the user unless discovery fails:

- What is the project root?
- What is the page or route in scope?
- Which files own layout, typography, styling, and metadata?
- Where should optimized image derivatives live?
- Which commands validate the result?
- Is public deployment in scope?

Store these answers in the site brief only when persistence is useful. Do not modify this reusable reference with project-specific values.


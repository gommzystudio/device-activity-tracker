# Known Compile / TypeScript Errors

This document lists currently observed TypeScript/compile errors and suggested fixes for contributors.

Summary of issues found (Dec 31, 2025):

- `src/index.ts`
  - `Cannot find name 'process'` (used in `process.argv`, `process.stdout`, `process.stdin`).
    - Fix: install Node types: `npm install --save-dev @types/node` and ensure `tsconfig.json` permits those types.
  - `Cannot find module '@whiskeysockets/baileys'`.
    - Fix: `npm install @whiskeysockets/baileys` and add types or `declare module` fallback if no types are published.
  - `Cannot find module 'pino'` / `@hapi/boom` / `qrcode-terminal`.
    - Fix: install packages: `npm install pino @hapi/boom qrcode-terminal` and add types if needed.
  - `Cannot find module 'readline'`.
    - Fix: builtin Node module — install `@types/node`.
  - `Parameter 'update' implicitly has an 'any' type` (event handler callback).
    - Fix: add an explicit type: `async (update: any) => {}` or import the event types from the package.
  - `Parameter 'number' implicitly has an 'any' type` (readline callback).
    - Fix: use `async (phoneNumber: string) => {}`.

- `src/scripts/init-signal.ts`
  - `Cannot find module 'child_process'`, `os`, `path` — Node builtins not found.
    - Fix: install `@types/node`.
  - `Cannot find name 'process'` (usage of `process.exit(1)`).
    - Fix: install `@types/node`.

General guidance:

- Install developer dependencies before running the TypeScript compiler:

```bash
npm install
npm install --save-dev @types/node
```

- After installing, run a compile check:

```bash
npx tsc --noEmit
```

- If a package does not ship types, either:
  - add a `declare module 'name';` in a local `types/` file, or
  - contribute type declarations to `@types` or the package itself.

If you fix one of the issues listed here, please update this document accordingly and open a PR.

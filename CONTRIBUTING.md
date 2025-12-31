# Contributing to Device Activity Tracker

Thanks for your interest in this PoC!

## How to contribute
1. Fork and clone the repo
2. Create a branch: `git checkout -b feature/my-change`
3. Install deps: `npm install` (and `cd client && npm install && cd ..`)
4. Make your changes
5. Open a pull request with a short description and motivation

## Guidelines

## Quick fixes for common TypeScript/compile errors

If you encounter TypeScript compilation errors when contributing, follow these quick steps to get a clean local environment:

- Install Node type definitions: `npm install --save-dev @types/node`
- Install any missing runtime dependencies listed in `package.json` with `npm install`.
- Run the TypeScript compiler to surface errors: `npx tsc --noEmit`.
- See `docs/KNOWN_ERRORS.md` for a curated list of current compile errors and suggested fixes.

If an imported package doesn't ship types, add a `declare module 'package-name';` fallback or contribute type declarations upstream.

## Pull Request Checklist

Please ensure your PR follows the checklist below. This helps maintainers review and land changes quickly.

- [ ] I have installed project dependencies: `npm install` (and `cd client && npm install` if working in the UI)
- [ ] I ran TypeScript checks: `npx tsc --noEmit` — there are no new compile errors
- [ ] I installed Node types locally if touching server or scripts: `npm install --save-dev @types/node`
- [ ] I added or updated tests when applicable and ran them
- [ ] I added or updated docs (see `docs/KNOWN_ERRORS.md`) for breaking changes
- [ ] My PR description explains why the change is needed and references any related issues

If your change fixes an existing compile error listed in `docs/KNOWN_ERRORS.md`, add a short note in the PR body pointing to the doc and which lines were fixed.

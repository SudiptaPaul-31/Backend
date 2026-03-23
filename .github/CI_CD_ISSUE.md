# Establish CI pipeline so all tests pass before merging

## User story

**As a** Developer,  
**I want** an automated Continuous Integration (CI) pipeline for our Node.js/TypeScript backend  
**so that** all incoming code is type-checked, passes lint, builds successfully, and all tests pass before it can be merged.

---

## Description

We need a GitHub Actions workflow so that:

- Code quality is enforced (TypeScript strict, no type errors).
- The project always builds.
- The test suite must pass before merge.
- Maintainers get fast feedback on PRs without manual checks.

This matches our current backend: **Node.js**, **TypeScript**, **Express**, with scripts `lint` (`tsc --noEmit`), `build` (`tsc`), and `test` (to be run in CI).

---

## Requirements

1. **Workflow file**  
   Add a GitHub Actions workflow at **`.github/workflows/node-ci.yml`**.

2. **Triggers**  
   The workflow must run on:
   - Pushes to **`main`** and **`develop`**
   - All **Pull Requests** (opened, synchronized, reopened)

3. **Environment**  
   - Runner: **`ubuntu-latest`**

4. **Job steps** (in order):
   - Checkout the repository.
   - Set up the **Node.js** version used by the project (e.g. Node 20 LTS).
   - **Cache** npm dependencies (e.g. `~/.npm` or `node_modules`) to speed up later runs.
   - Install dependencies with **`npm ci`** (reproducible installs).
   - **Lint**: run **`npm run lint`** (TypeScript type-check only; must pass).
   - **Build**: run **`npm run build`** (must succeed).
   - **Test**: run **`npm test`** (must pass; add or keep a `test` script in `package.json`).

---

## Acceptance criteria

- [ ] Workflow file exists at **`.github/workflows/node-ci.yml`**.
- [ ] Workflow runs on every PR (and on push to `main`/`develop`).
- [ ] Pipeline **fails** if TypeScript lint fails (`npm run lint`).
- [ ] Pipeline **fails** if the build fails (`npm run build`).
- [ ] Pipeline **fails** if tests fail (`npm test`).
- [ ] Pipeline **passes** only when lint, build, and tests all succeed.
- [ ] `package.json` has a **`test`** script (placeholder or real test runner) so `npm test` is defined.

---

## Notes for implementers

- Use **`actions/checkout`**, **`actions/setup-node`**, and **`actions/cache`** (or similar) as needed.
- Pin Node version (e.g. `node-version: '20'`) for consistency.
- If there is no test framework yet, use a minimal script, e.g.  
  `"test": "echo \"No tests yet\" && exit 0"`  
  and replace it when adding Jest, Vitest, or another runner.
- Optional later improvements: add ESLint/Prettier and format checks, or a separate `lint:style` job.

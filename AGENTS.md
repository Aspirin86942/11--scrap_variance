# Repository Guidelines

## Project Structure & Module Organization

This repository is a WPS JS add-in for OA/ERP scrap variance checks. TypeScript source lives in `src/`, with the bundle entry at `src/entry.ts`. Core comparison logic is under `src/core/`, WPS integration under `src/wps-api/`, ribbon and button wiring under `src/ribbon/` and `src/actions/`, and macro-facing workflows under `src/macros/`. Query dialog state and launcher code are in `src/query-dialog/`, while the static WPS-loaded dialog assets are in `ui/query-dialog.html` and `ui/query-dialog.js`.

Tests live in `tests/` and generally mirror the source area, such as `tests/core/`, `tests/macros/`, `tests/wps-api/`, and `tests/query-dialog/`. Runtime add-in files include `index.html`, `ribbon.xml`, and the committed generated bundle `main.js`.

## Build, Test, and Development Commands

Use `npm`, because this repo has `package-lock.json`.

- `npm run typecheck`: runs `tsc --noEmit` with strict TypeScript settings.
- `npm test`: runs the Vitest suite once.
- `npm run build`: type-checks, then bundles `src/entry.ts` into committed `main.js`.
- `npm run build:prod`: creates a minified production bundle.
- `npm run bench`: builds and runs the Node benchmark under `.bench/`.
- `npm run dev`: builds, then starts `wpsjs debug` for WPS add-in testing.

After TypeScript changes that affect runtime behavior, regenerate `main.js` with `npm run build` before finishing.

## Coding Style & Naming Conventions

Prefer TypeScript for new business logic. Keep `strict` compatibility, explicit exported function types, and narrow any WPS-related `any` usage to the smallest boundary. Do not use Node-only APIs in WPS/browser runtime code. Prefer batch Range reads/writes over cell-by-cell WPS access.

Use descriptive domain names, such as `buildOaRows`, `queryDirection`, or `writeResults`. Test files use `*.test.ts`.

## Testing Guidelines

Vitest is the main test framework. Add focused tests next to the affected domain area in `tests/`. For WPS behavior, cover pure logic with mocks first, then use `MANUAL_TEST.md` for real WPS checks when UI, ribbon, dialog, or workbook behavior changes.

Run at least `npm run build` and `npm test` before handing off changes. Use `git diff --check` to catch whitespace issues.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style prefixes: `feat:`, `fix:`, `test:`, and `chore:`. Keep commits scoped, for example `fix: require exact grouped range widths`.

Pull requests should describe the behavior change, list verification commands, and call out WPS manual test coverage when relevant. Include screenshots only for visible dialog, ribbon, or worksheet output changes. Do not commit local artifacts such as `.bench/`, `wps-addon-build/`, or temporary worktrees.

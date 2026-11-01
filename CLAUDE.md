# Notes for AI coding assistants

Laramac is a free macOS local development environment (an alternative to Laragon) built with
Electron 45, electron-vite, React 18 and TypeScript. Read MAINTAINING.md for releases and builds.

## Rules

- Security first. The renderer is untrusted: every IPC handler in `src/main/index.ts` validates its input (`ValidationError`, `siteByName`, `sitePath`). Never pass user text to a shell; use `execFile` with argument arrays.
- Secrets (tokens, passwords, API keys) go in the Keychain through `safeStorage` (`secrets.ts`, `models.ts`), never in plain files, logs or commits. Tokens used for one action (cloning, listing repos) are used once and not stored.
- Anything that runs a project's own code (composer install, npm install, migrations) needs the person's consent in the UI first.
- Writing style in the UI and docs: plain, friendly English for non-experts. Never use em dashes; use a colon and a space instead.
- Keep changes isolated: a PHP or service change must not affect other versions or services.

## Layout

- `src/shared/types.ts`: `Channels` (request and response) and `Events` (main to renderer). Add a channel here first.
- `src/main/index.ts`: `handle('channel', fn)` for every channel. Long work goes through `jobs.run` so it shows progress; results go to `activity.push`.
- `src/main/*.ts`: one module per area (php, importer, review, scan, devservers, runtimes...). `src/main/svc/` has one file per service.
- `src/renderer/src/pages/` and `components/`: the UI. `useApp()` from `store.tsx` gives state and `act(key, fn)`, which tracks busy state and shows errors. Styles are all in `theme.css` (smoked glass theme).

## Checks before committing

```sh
npm run typecheck
npx vitest run --exclude tests/v13.test.ts   # v13 creates real projects and is slow
npm run build
```

Add a test file per release (`tests/vNN.test.ts`) for new logic. Bump `package.json` and add notes at the top of `RELEASE_NOTES.md` for each release.

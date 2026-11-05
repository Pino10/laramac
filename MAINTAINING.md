# Maintaining Laramac

This is the owner's manual. Everything needed to build, release and fix Laramac lives in this
repository and on GitHub, so nothing depends on a chat or on one computer. If you lose your Mac,
your chats or your memory of how it works, start here.

## The short version

| I want to | Do this |
| --- | --- |
| Ship a new version | Change `version` in `package.json`, add notes at the top of `RELEASE_NOTES.md`, push, then run **Build and release** with the new tag (below). |
| Get a new PHP release | Nothing. **Build latest PHP** runs every day and builds it. |
| Fix a broken PHP build | Run **Build latest PHP** by hand with **force** on. |
| Check everything still works | Push to `main`; **CI** runs the tests. Or run `npm test` on your Mac. |
| Undo a bad release | Delete that release on GitHub; the app falls back to the newest one left. Then fix and release a higher version. |

## How the pieces fit

```
You push code ─► CI (tests on every push)
You run "Build and release" ─► builds the Mac app ─► GitHub release vX.Y.Z ─► the app's Updates page finds it
Every day ─► "Build latest PHP" ─► checks php.net ─► builds PHP (and Xdebug) ─► release "php-builds" ─► the app's PHP page offers it
By hand, rarely ─► "Build server binaries" ─► Nginx and Redis ─► release "binaries"
```

All four are in `.github/workflows/` and run on GitHub's own Macs, for free on a public repository.

## Releasing a new version

1. Edit `package.json`: `"version": "0.18.0"` (no `v`).
2. Add a `## New in 0.20` section at the top of `RELEASE_NOTES.md`. The app shows this text on its Updates page.
3. Commit and push to `main`. Wait for the green tick from **CI**.
4. On GitHub: **Actions** › **Build and release** › **Run workflow**, tag `v0.18.0` (with the `v`). Or tag and push it: `git tag v0.18.0 && git push origin v0.18.0`.
5. In about 10 to 15 minutes the release appears with 3 files: a `.dmg` for Apple Silicon, one for Intel, and `SHA256SUMS.txt`.

Every copy of Laramac checks the newest release and offers the update itself. Releases are checksummed, and `install.sh` checks both the checksum and the code signature.

From a terminal with the GitHub CLI, step 4 is:

```sh
gh api -X POST repos/Pino10/laramac/actions/workflows/release.yml/dispatches -f ref=main -f 'inputs[tag]=v0.18.0'
```

## PHP builds

- Made with [static-php-cli](https://static-php.dev): one self-contained `php` and `php-fpm` per version, about 50 extensions built in (the list is `EXTENSIONS` at the top of `php-builds.yml`).
- Only the **newest** PHP is built, for Apple Silicon and Intel, checked daily against php.net. When a new minor version comes out (8.6, say), it is built and the older builds are removed from the release automatically. People add older versions themselves from a static-php.dev download (PHP page › Add a version); PHP already on anyone's Mac is never touched.
- Each version is published as: `php-X.Y.Z-cli-…`, `php-X.Y.Z-fpm-…`, `php-X.Y.Z-xdebug-…` (or a `.none` marker if Xdebug could not be built), the extension list, and a `.sha256` file. The app refuses any download that does not match the checksum.
- **Xdebug** is a separate file (`xdebug.so`) because it can only be built that way. PHP loads it only when Xdebug is switched on, on the PHP page. If building Xdebug ever fails, PHP is built without it, so a PHP update is never held back.
- If a build is not ready yet, the app falls back to static-php.dev's own builds.

**Adding an extension:** add it to `EXTENSIONS`, then run **Build latest PHP** with **force** on. Check the build log first: some extensions need extra libraries.

**A new PHP version** (for example 8.6) is picked up by the daily build on its own. Add it to `SUPPORTED_PHP` in `src/main/versions.ts` and release the app so the PHP page knows its name. To build a specific older version by hand, run **Build latest PHP** with that version in **minors**; manual runs never remove anything.

**Can a PHP change break everything?** No. PHP is downloaded per version into `~/.laramac/php/X.Y`. A bad build affects only that version, and only for people who update to it. Fix it with a forced rebuild; people get the fix through the PHP page.

## Settings on GitHub

Under **Settings** › **Secrets and variables** › **Actions**. None are required; these are optional:

| Name | Kind | What it does |
| --- | --- | --- |
| `MAC_RUNNER` | variable | Set to `self-hosted` to build on your own Mac instead of GitHub's. Leave unset normally. |
| `RELEASES_REPO` | variable | Publish releases to another repository (for example a public one while code stays private). |
| `RELEASES_TOKEN` | secret | A token allowed to write releases to `RELEASES_REPO`. Only needed with it. |

Never paste a token into a chat, an issue or a commit. Tokens belong in GitHub secrets or in the Mac's Keychain (Laramac stores yours there).

## Code map

| Folder | What is there |
| --- | --- |
| `src/main/` | Everything that touches the Mac: servers, PHP, databases, downloads, imports, security tools. Runs in Electron's main process. |
| `src/main/sitetools.ts` | The site page's Requests, Workers, Tests, Compose, debugging, QR, scrambling, schema compare and hosting helpers (pure functions, tested). |
| `src/main/workers.ts` | Background workers per site. |
| `src/main/webhooks.ts` | Slack, Teams and Discord messages, and Raycast script commands. |
| `src/main/svc/ollama.ts` | Ollama as a service. |
| `src/main/seckit/skillpacks.ts` | Shared with MacSec: Trail of Bits, Sentry, Cloudflare and Anthropic skill packs. Slash commands become skills with `commandToSkill`. |
| `src/main/seckit/editors.ts` | Shared with MacSec: finding editors and IDEs and opening a folder or file at a line in each. |
| `src/main/seckit/skillplan.ts` | Shared with MacSec: the skills a review can load (`skillCatalog`), the project's stack (`detectStack`), what fits it (`recommend`), the time estimate and the per-review skill folder (`buildSkillSet`). |
| `src/main/ide.ts`, `src/main/idecore.ts`, `src/main/idetheme.ts` | Laramac Code: installing code-server (checked against GitHub's SHA-256), its settings and extensions, the Studio theme as a VSIX, starting it on 127.0.0.1 with a password, and its window (`ideNavigationAllowed` keeps it on its own address). `idecore.ts` is pure and tested. |
| `src/main/phpdev.ts` | PHP quick settings (a marked block in each version's custom ini), the global PHP tools installed with Composer, and the Artisan actions (fixed arguments only). |
| `src/renderer/src/pages/Services.tsx` | The Services page; `SERVICE_SECTIONS` says which services go in which group. |
| `src/main/seckit/ghapi.ts` | Shared with MacSec: every api.github.com call (sign-in, caching, rate limits, release feed fallback). Never call GitHub's API with plain fetch. |
| `src/main/seckit/freellm.ts` | Shared with MacSec: Free LLM API addresses, keys, models and the environment for Claude Code. |
| `src/main/nodeversions.ts` | Node.js per project: what a project asks for, installing other major versions, the node/npm/npx commands that switch by folder. |
| `src/main/updates.ts` | Helpers for the Updates page: version jumps, Homebrew and tool version parsing. The collecting and applying is in `index.ts`. |
| `src/main/claudesetup.ts` | The claudelm command and "Set up Claude everywhere". |
| `src/main/azure.ts` | Azure DevOps: repositories, pipelines, pull requests, clone and push. |
| `src/main/apiroutes.ts` | The API client's "requests from a site's code": route readers per framework. |
| `src/main/seckit/lmstudio.ts` | Shared with MacSec: makes sure an LM Studio model has enough context for Claude Code. |
| `src/main/hub.ts` | The site page and the Doctor: health checks and their fixes, .env files, outdated packages, review findings, recon compare and export. |
| `src/main/svc/` | One file per service (MySQL, Redis, Mailpit…): install, start, stop. |
| `src/renderer/` | The interface (React). Pages in `pages/`, dialogs and panels in `components/`, all styles in `theme.css`. |
| `src/shared/` | Types and data both sides use. `types.ts` lists every message between the interface and the main process (`Channels`). |
| `tests/` | Vitest tests. `tests/v13.test.ts` really creates projects and is slow; the rest take about 30 seconds. |
| `.github/workflows/` | CI, releases, PHP builds, server binaries. |

Adding a feature usually means: a function in `src/main/`, a channel in `Channels` (`src/shared/types.ts`), a `handle('…')` in `src/main/index.ts`, and a button in a page. The interface can only ask; the main process checks every request before doing anything.

## Shared with MacSec

`src/main/seckit/` (recon, reviewers, skills) is the same in Laramac and MacSec. Change it in one and copy it to the other.

## Working on it

```sh
npm install
npm run dev        # the app, with live reload
npm test           # tests
npm run typecheck  # types
npm run dist       # a .dmg in dist/ (unsigned; for your own Mac)
```

## Where Laramac keeps things on a Mac

Everything is in `~/.laramac`: `php/`, `mysql/`, `conf/` (generated configs), `logs/`, `runtimes/` (Node.js, Python and others), `bin/` (the `php`, `composer` and `laramac` commands), `imports/` (temporary). Sites stay in the www folder chosen in Settings. Settings › Reset can remove Laramac's files without touching sites.

## When something breaks

1. **A release did not build:** open the failed run in **Actions** and read the red step. Most often a test failed or a dependency changed. Fix, push, run **Build and release** again with the same tag.
2. **The daily PHP build fails:** nothing changes for anyone; the app keeps the last good builds. Read the log, fix `php-builds.yml`, run it with **force** on.
3. **Something does not work for someone:** ask for the files in `~/.laramac/logs/`, one per server and PHP version. Each site's ⋯ › View logs shows the same live.
4. **Undo a change:** every change is a commit. `git log` finds it, `git revert <commit>` undoes it.

## Working with an AI assistant

`CLAUDE.md` tells AI coding assistants how this project is built and the rules it follows. Point any assistant at this repository; it does not need the old chats.

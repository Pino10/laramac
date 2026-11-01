# Laramac

A free, open-source local development environment for macOS, inspired by [Laragon](https://laragon.org). Not affiliated with Laragon or Laravel.

**Status: v0.5.2, early. Not yet tested on a real Mac by its author.** The server layer is tested against real Nginx, Apache and PHP-FPM on Linux, but the macOS app itself (windowing, menu bar, Liquid Glass, downloads of macOS binaries) needs people to try it and report problems. Please open issues.

## What it does

- **Sites:** every folder in `~/www` becomes `https://<folder>.test`, with wildcard subdomains.
- **PHP:** install any version (8.0 to 8.5 and newer as they appear), keep several side by side, pick one per site. Static builds from [static-php-cli](https://github.com/crazywhalecc/static-php-cli), with a full or lightweight extension set.
- **Web servers:** Nginx on 80/443 and Apache on 8080/8443.
- **Databases:** MySQL 8.4 (newest build for your Mac), MariaDB, PostgreSQL (any major version), Redis and MongoDB, side by side on their own ports, none needing a password. Admin tools: phpMyAdmin (auto sign-in) and Adminer.
- **Mail:** Mailpit catches everything your apps send. PHP's `mail()` is wired to it.
- **HTTPS:** a local certificate authority issues certificates per site. One click to trust it in your keychain.
- **Public links:** share a site with Cloudflare Tunnel (no account) or ngrok.
- **Import:** bring in a site from Laragon, a server backup or a teammate. Choose a .zip, .tar.gz, folder or .sql dump: Laramac finds the project and its database, asks a few questions, puts the files in `~/www`, loads the dump into MySQL or MariaDB, and points `wp-config.php` or `.env` at it. ⌘I opens it.
- **New projects:** blank PHP, WordPress (database created and configured), or Laravel (via Composer, `.env` wired to MySQL and Mailpit).
- **Editors:** open any site in Cursor or VS Code.
- **AI:** connect any local model (Ollama, LM Studio, or any OpenAI-compatible server). The assistant proposes actions and you press the button. Open Claude Code in any site folder with PHP, Composer and MySQL on its PATH.
- **Interface:** designed for macOS 27 Golden Gate (sidebar to the window edge, native Liquid Glass that follows the system transparency slider, Reduce Transparency respected). A live map of your stack on the Overview, where connections carry a moving current when both ends are running. Native Liquid Glass on macOS 26 (vibrancy on earlier versions), Poppins, light and dark themes.
- **Keyboard:** ⌘K opens a command bar for every site, service and action. ⌘1 to ⌘7 switch pages, ⌘N starts a new project.
- **Notifications:** macOS notifications and an in-app activity list for finished installs, shared links and services that stop unexpectedly.
- **Menu bar:** start and stop everything, open phpMyAdmin, the mail inbox or your projects folder.

## Install

Download the DMG for your Mac from [Releases](https://github.com/Pino10/laramac/releases) (`arm64` for Apple Silicon, `x64` for Intel) and drag Laramac to Applications.

Laramac is ad-hoc signed but not notarized by Apple (that needs a paid developer account), so macOS asks you to confirm the first launch:

1. Open Laramac. macOS says it cannot verify the developer. Click **Done**.
2. Open **System Settings > Privacy & Security**, scroll down and click **Open Anyway** next to Laramac, then confirm.

If macOS says Laramac "is damaged" (builds before 0.5.1 were not signed), run this once in Terminal:

```sh
xattr -cr /Applications/Laramac.app && codesign --force --deep --sign - /Applications/Laramac.app
```

## First run

1. On the Dashboard, press **Set up** under "Open .test domains" (asks for your password once; it writes `/etc/resolver/test`).
2. Press **Trust** under "Trust local HTTPS" if you want HTTPS sites without browser warnings.
3. Install PHP, Nginx, MySQL and Mailpit from the Dashboard, then **Start All**.
4. Create a project from **Sites > New project**.

Everything Laramac downloads lives in `~/.laramac`. Settings are in `~/.laramac/settings.json`.

### How `.test` domains work

Laramac runs a tiny DNS server on `127.0.0.1:53535` that answers every `*.test` name with `127.0.0.1`, and one file, `/etc/resolver/test`, tells macOS to ask it. No dnsmasq and no `/etc/hosts` edits.

## Nginx and Apache

Until the "Build server binaries" workflow has been run on this repo's Actions tab, Laramac installs Nginx and Redis with Homebrew. After it publishes self-contained builds, those two need nothing else. Apache and MariaDB always use Homebrew.

PHP, MySQL, PostgreSQL, MongoDB, Mailpit, phpMyAdmin, Adminer, Composer, Cloudflare Tunnel and ngrok are downloaded directly and need no Homebrew.

## Develop

```sh
npm install
npm run dev         # run the app with hot reload
npm run typecheck
npm test            # on Linux with nginx, apache2 and php-fpm installed, also runs end-to-end server tests
npm run dist        # build a DMG (macOS only)
```

Releases are built by GitHub Actions: push a tag like `v0.2.0` and DMGs are attached to the release.

### Layout

- `src/main`: Electron main process. `configgen.ts` turns state into Nginx, Apache, PHP-FPM and MySQL config and has no Electron imports, so it is easy to test. `svc/` has one file per service.
- `src/renderer`: the React interface.
- `src/shared`: types shared by both sides, including the typed IPC channel map.
- `tests`: unit tests plus end-to-end tests against real servers.

## Security

Laramac runs servers on your Mac, so it is built to stay closed by default:

- **Only this Mac can reach your sites.** Nginx refuses requests from other machines and Apache listens on loopback. Turn on "Open to other devices" in Settings to test from a phone. Every database, PHP-FPM, Mailpit and the DNS server listen on 127.0.0.1 only.
- **The local certificate authority can only vouch for your local suffix.** It carries an X.509 name constraint, so even a leaked key could not impersonate a real website. Keys are readable only by you.
- **The interface cannot drive the system directly.** The page runs sandboxed with context isolation, a strict Content Security Policy, no navigation and no permissions. Every request it makes is checked in the main process: settings are validated field by field, paths must be your own sites, versions must be plain numbers, and only web addresses can be opened.
- **Admin rights are used once,** to write `/etc/resolver/<suffix>`. The suffix is limited to reserved names (`test`, `internal`, `lan`, `example`) and checked again before the command runs.
- **Downloads use HTTPS.** PostgreSQL and Composer are also checked against their published SHA-256 checksums.
- **Electron's own security switches** are set in the build: the app cannot be run as a plain Node.js process, and `NODE_OPTIONS` and debugging flags are ignored.
- Settings (which can hold your ngrok token) are saved with owner-only permissions.
- **Imports are unpacked privately first.** Archive entries that climb out of their folder are refused, links and special files are left out, and size and file-count limits apply. SQL dumps are fed through a filter that refuses client commands (`\!`, `system`, `source`, `tee`, `pager`) and drops statements that switch databases or change users, and the client runs with `--commands=OFF` (MySQL) or `--sandbox` (MariaDB) and `--local-infile=0`. Composer scripts from imported projects only run if you tick the box.

The test suite includes attacks: a forged certificate for a real domain, path-traversal version strings, shell metacharacters in settings, requests from another machine on the network, zip-slip and tar traversal archives, symlink archives, and SQL dumps that try to run shell commands. Imports are tested end to end against a real MariaDB server.

Report security problems privately through GitHub's security advisories for this repository.

## Known limits

- Node projects are listed but not proxied yet.
- PostgreSQL has no `psql` command (the prebuilt binaries omit it). Use Adminer or your own client.
- MongoDB is the Community Edition under the SSPL, which is free for local development.
- No auto-update (needs a signed app).
- Apache and Nginx share sites but run on different ports.
- Firefox keeps its own certificate store, so HTTPS sites may need the CA imported there by hand (`~/.laramac/certs/laramac-ca.pem`).

## Contributing

Issues and pull requests are welcome.

## License

MIT

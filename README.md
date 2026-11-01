<p align="center">
  <img src="build/icon.png" width="128" alt="Laramac">
</p>

<h1 align="center">Laramac</h1>

<p align="center">A fast, free local development environment for macOS.<br>PHP, Apache, MySQL and everything around them, in one app.</p>

<p align="center">
  <a href="https://github.com/Pino10/laramac/releases/latest">Download</a> ·
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#security">Security</a>
</p>

---

## Features

**Sites**
- Every folder in `~/Laramac/www` becomes `https://<folder>.test`, with wildcard subdomains.
- Works with the conventions projects already use: `http://localhost/<folder>`, `http://127.0.0.1/<folder>`, `<folder>.localhost`, and any extra names you add, like `shop.local`.
- Database hosts `localhost`, `127.0.0.1` and `localhost:3306` all reach MySQL, so configs from Laragon, XAMPP or MAMP work unchanged.
- Trusted local HTTPS for every site.
- New WordPress, Laravel or PHP projects in one click.
- Import from Laragon, a server backup or a teammate: a `.zip`, `.tar.gz`, folder or `.sql` dump. Files, database and config are set up for you.
- Share any site with a public link through Cloudflare Tunnel or ngrok.
- **Deploy** a site to your hosting over SFTP, FTPS or FTP. Only new and changed files are sent; `.env`, `node_modules` and `.git` stay local.

**PHP**
- PHP 8.0 to 8.5, side by side, chosen per site.
- Always the newest releases, built for Apple Silicon and Intel, offered as updates as soon as php.net publishes them.
- All common extensions built in, with a `php.ini` tuned for each version. Add your own settings with **Edit php.ini**.
- Composer included.

**Web servers**
- Apache on ports 80 and 443, with full `.htaccess` support.
- Nginx alongside on 8080 and 8443, or make it the main server in Settings.

**Databases**
- MySQL 8.4, MariaDB, PostgreSQL, Redis, Memcached, MongoDB and Meilisearch, each on its own port.
- Create, back up, restore and delete databases from the app.
- **Snapshots:** save a site's files and database together, go back to any snapshot, or export one and import it on another Mac.
- phpMyAdmin with automatic sign-in, and Adminer.

**Mail**
- Mailpit catches every email your apps send. PHP's `mail()` is wired to it.

**Servers**
- Save your remote servers (SSH, FTPS or FTP) and open a full SSH terminal inside Laramac. Select to copy, right-click to paste.
- Browse, upload, download, rename and delete files over SFTP.

**API client**
- Build and test API requests like Insomnia or Postman: methods, query, headers, JSON, form and multipart bodies, bearer and basic auth.
- Environments with `{{variables}}`, request history, pretty JSON responses, copy as cURL.
- Import Postman collections, Insomnia exports, OpenAPI (JSON) files or a pasted cURL command.

**GitHub**
- Sign in once (with the GitHub CLI or a token kept in the Keychain) and see all your public and private repositories.
- Clone any repository into your projects folder, and edit a repository's description, website and visibility.
- Push a site from the Sites page. Each push asks how it should go up: straight to main, a new branch, a version tag, or a GitHub release.

**AI tools**
- Connect Claude Code to Laramac in one click. It can then list your sites, start services, switch PHP, create and query databases, read logs and take snapshots while it works.
- Install and open Claude Code, Codex, OpenCode, vMLX, LM Studio, Ollama, OpenClaw and Gemini CLI, as Mac apps or in the terminal.
- Open any site in your chosen tool with one click.
- A built-in assistant that runs on your own local model.

**Everyday**
- **Packages** shows everything Laramac installed with its size, so you can remove what you no longer use.
- ⌘K command bar for every site, service and action. ⌘1 to ⌘9 switch pages.
- Menu bar controls, macOS notifications and an activity list.
- Updates install from inside the app, and **Updates** shows the changelog for every version. Settings, PHP versions, databases and sites are kept.
- **Settings › Reset** clears software, data or settings without uninstalling. Your projects are never touched.
- Native Liquid Glass on macOS 26 and later, light and dark.

## Getting started

1. Install with one line in Terminal. It downloads the newest release, checks its checksum and signature, and puts Laramac in Applications without the "Open Anyway" step:
   ```sh
   curl -fsSL https://raw.githubusercontent.com/Pino10/laramac/main/install.sh | bash
   ```
   Or download the DMG from [Releases](https://github.com/Pino10/laramac/releases/latest) and drag Laramac to Applications. The first time, macOS asks you to confirm in **System Settings › Privacy & Security › Open Anyway**.
2. Open Laramac. Updates after that install from inside the app.
3. On the Overview, press **Set up my stack**. Laramac installs PHP, Apache, MySQL, phpMyAdmin and Mailpit, starts them, and turns on `.test` addresses with HTTPS.
4. Create a project from **Sites › New project**, or drop a folder into `~/Laramac/www`.

Apache, Nginx, Redis, MariaDB and Memcached install through [Homebrew](https://brew.sh). Everything else downloads directly.

### Where things live

| What | Where |
| --- | --- |
| Your projects | `~/Laramac/www` (an existing `~/www` is used if you have one) |
| PHP, databases, downloads | `~/.laramac` |
| Settings | `~/.laramac/settings.json` |

Updating Laramac replaces only the app, so all of this stays.

### How `.test` addresses work

Laramac runs a small DNS server on `127.0.0.1:53535` that answers every `*.test` name with `127.0.0.1`. One file, `/etc/resolver/test`, tells macOS to ask it. No `/etc/hosts` edits.

## Security

- **Only your Mac can reach your sites**, unless you turn on "Open to other devices". Databases, PHP and Mailpit listen on `127.0.0.1` only.
- **The local certificate authority is limited to `.test` names**, so it can never vouch for a real website.
- **The interface is sandboxed.** Every request it makes is validated before anything runs.
- **Admin rights are used once**, to write `/etc/resolver/test`.
- **Every download is verified.** PHP builds, PostgreSQL, Composer and app updates are checked against published SHA-256 checksums, and updates are signature-checked before they install.
- **SSH host keys are pinned** on first connect, and saved passwords are kept in the macOS Keychain.
- **The Claude Code connection** listens only on this Mac, needs a private key, refuses web pages, and its database access is read-only.
- **Imports are checked** for unsafe archives, and SQL dumps cannot run commands on your Mac.

Please report security issues privately through GitHub security advisories.

## Development

```sh
npm install
npm run dev        # run with hot reload
npm run typecheck
npm test
npm run dist       # build a DMG (macOS)
```

- `src/main`: Electron main process. `configgen.ts` generates Apache, Nginx, PHP and MySQL config. `svc/` has one file per service.
- `src/renderer`: the React interface.
- `src/shared`: types shared by both, including the typed IPC map.
- `tests`: unit tests and end-to-end tests against real servers.

## Contributing

Issues and pull requests are welcome.

## License

MIT. Not affiliated with Laragon or Laravel.

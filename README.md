# Laramac

A free, open-source local development environment for macOS, inspired by [Laragon](https://laragon.org). Not affiliated with Laragon or Laravel.

**Status: v0.2, early. Not yet tested on a real Mac by its author.** The server layer is tested against real Nginx, Apache and PHP-FPM on Linux, but the macOS app itself (windowing, menu bar, Liquid Glass, downloads of macOS binaries) needs people to try it and report problems. Please open issues.

## What it does

- **Sites:** every folder in `~/www` becomes `https://<folder>.test`, with wildcard subdomains.
- **PHP:** install any version (8.0 to 8.5 and newer as they appear), keep several side by side, pick one per site. Static builds from [static-php-cli](https://github.com/crazywhalecc/static-php-cli), with a full or lightweight extension set.
- **Web servers:** Nginx on 80/443 and Apache on 8080/8443.
- **Database:** MySQL 8.4 (root, no password) and phpMyAdmin with automatic sign-in.
- **Mail:** Mailpit catches everything your apps send. PHP's `mail()` is wired to it.
- **HTTPS:** a local certificate authority issues certificates per site. One click to trust it in your keychain.
- **Public links:** share a site with Cloudflare Tunnel (no account) or ngrok.
- **New projects:** blank PHP, WordPress (database created and configured), or Laravel (via Composer, `.env` wired to MySQL and Mailpit).
- **Editors:** open any site in Cursor or VS Code.
- **AI:** connect any local model (Ollama, LM Studio, or any OpenAI-compatible server). The assistant proposes actions and you press the button. Open Claude Code in any site folder with PHP, Composer and MySQL on its PATH.
- **Interface:** Liquid Glass on macOS 26, frosted blur on older versions. Menu bar app.

## Install (unsigned build)

Laramac is not signed with an Apple Developer certificate, so macOS shows a warning the first time.

1. Download the DMG for your Mac from Releases (`arm64` for Apple Silicon, `x64` for Intel).
2. Drag Laramac to Applications.
3. Right-click Laramac, choose **Open**, then confirm.
4. If macOS still blocks it, open **System Settings > Privacy & Security** and choose **Open Anyway**, or run:

   ```sh
   xattr -dr com.apple.quarantine /Applications/Laramac.app
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

Until the "Build server binaries" workflow has been run on this repo's Actions tab, Laramac installs Nginx and Apache with Homebrew (`brew install nginx httpd`), so Homebrew is needed for those two. After the workflow publishes a self-contained Nginx build, Nginx needs nothing else. Apache still uses Homebrew.

PHP, MySQL, Mailpit, phpMyAdmin, Composer, Cloudflare Tunnel and ngrok are all downloaded directly and need no Homebrew.

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

## Known limits

- Node projects are listed but not proxied yet.
- No auto-update (needs a signed app).
- Apache and Nginx share sites but run on different ports.
- Firefox keeps its own certificate store, so HTTPS sites may need the CA imported there by hand (`~/.laramac/certs/laramac-ca.pem`).

## Contributing

Issues and pull requests are welcome.

## License

MIT

Laramac is a free, open-source local development environment for macOS, inspired by Laragon.

## New in 0.6
- **Your data survives updates.** Settings, PHP versions, databases and downloads live in `~/.laramac`, and updating only replaces the app.
- **Updates inside the app.** Laramac checks for new versions, shows what changed, verifies the download and restarts into the new version.
- **Apache first.** Apache is now the main web server on ports 80 and 443, with Nginx beside it on 8080 and 8443. Swap them in Settings.
- **Always the newest PHP.** PHP 8.5.12, 8.4.27, 8.3.36 and every new php.net release, built daily for Apple Silicon and Intel. Laramac tells you when an update is ready.
- **php.ini made for your version.** Tuned for local development, with settings newer PHP removed left out. Add your own lines with Edit php.ini.
- **SSH and SFTP.** Save servers, open SSH in Terminal, and browse files WinSCP-style.
- **AI tools.** Install and launch Claude Code, OpenCode, OpenClaw, Codex, Gemini CLI, vMLX, MLX LM, Ollama and LM Studio.
- **More databases.** Memcached and Meilisearch join MySQL, MariaDB, PostgreSQL, Redis and MongoDB.
- **Set up my stack.** One click installs PHP, Apache, MySQL, phpMyAdmin and Mailpit and starts them.
- **Reset without uninstalling.** Clear software, data, settings or system changes from Settings. Your projects are never touched.
- **Projects in `~/Laramac/www`.** Kept out of Documents so iCloud does not sync it. An existing `~/www` keeps working.
- **Interface.** Uses the full window in full screen, a new notification bell whose list scrolls, and a fresher Liquid Glass look.

## Fixed
- 0.6.1: Laramac only installs one of its own PHP builds when the build's checksum list is published, and checks every download against it.
- MySQL now installs the newest 8.4 build from Oracle's CDN and recovers from an interrupted first start.

## Download
- **Apple Silicon (M1 and later):** Laramac-0.6.1-arm64.dmg
- **Intel:** Laramac-0.6.1-x64.dmg

The app is not notarized by Apple yet, so confirm the first launch: open Laramac, click **Done**, then go to **System Settings > Privacy & Security** and click **Open Anyway**. From 0.6 on, updates install from inside the app.

## Security
Sites are only reachable from your Mac unless you allow your network. The local certificate authority can only vouch for `.test` names. Updates, PHP builds and imports are all verified. See the README for details.

## Known limits
This is an early preview, so please report problems in Issues.
- Apache, Nginx, Redis, MariaDB and Memcached need Homebrew for now.
- PostgreSQL has no `psql` command.
- A new PHP release takes about an hour to appear after php.net publishes it.

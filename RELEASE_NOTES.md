Laramac is a free, open-source local development environment for macOS, inspired by Laragon.

## Fixed in 0.5.2
- **"No MySQL build was found for this Mac."** Oracle's download page blocks requests from apps, so the MySQL install always failed. Laramac now downloads from Oracle's CDN directly and installs the newest MySQL 8.4 for your Mac (8.4.13 on Apple Silicon, 8.4.11 on Intel today). A test now checks Oracle's servers on every build.

## Fixed in 0.5.1
- **"Laramac is damaged and can't be opened."** The app is now ad-hoc signed, and every build is launched on a Mac before it is published.

## Download
- **Apple Silicon (M1 and later):** Laramac-0.5.2-arm64.dmg
- **Intel:** Laramac-0.5.2-x64.dmg

The app is not notarized by Apple yet, so confirm the first launch: open Laramac, click **Done**, then go to **System Settings > Privacy & Security** and click **Open Anyway**.

## What's inside
- Every folder in `~/www` becomes `https://name.test`
- PHP 8.0 to 8.5, side by side, chosen per site
- Nginx and Apache
- MySQL, MariaDB, PostgreSQL, Redis and MongoDB
- phpMyAdmin and Adminer
- Mailpit catches all outgoing mail
- One-click local HTTPS
- Public links through Cloudflare Tunnel or ngrok
- Import projects from Laragon or backups (.zip, .tar.gz, folder or .sql), with the database loaded and config updated
- New WordPress, Laravel or PHP projects in one click
- Open sites in Cursor, VS Code or Claude Code
- An assistant powered by your own local model
- Live stack map, ⌘K command bar, macOS notifications
- Designed for macOS 27 Golden Gate with native Liquid Glass

## Security
Sites are only reachable from your Mac unless you allow your network. The local certificate authority can only vouch for `.test` names. Imports are checked for unsafe archives and SQL dumps. See the README for details.

## Known limits
This is an early preview, so please report problems in Issues.
- Nginx, Redis, Apache and MariaDB need Homebrew for now.
- PostgreSQL has no `psql` command.
- No auto-update yet.

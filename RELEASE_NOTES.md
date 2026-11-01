Laramac is a free, open-source local development environment for macOS.

## New in 0.10
- **Your projects work as they are.** Database host `localhost` now reaches MySQL (PHP on a Mac looks for a socket file there, which caused "SQLSTATE[HY000] [2002] No such file or directory"). `127.0.0.1` and `localhost:3306` work too, and `/tmp/mysql.sock` points at Laramac's MySQL for other tools.
- **Laragon-style addresses.** Every project also opens at `http://localhost/name`, `http://127.0.0.1/name` and `http://name.localhost`.
- **Your own site names.** Settings › Addresses lets you add names like `shop.local` or `api.shop.test` to any site.
- **Deploy.** Send a site to your hosting over SFTP, FTPS or FTP from the Sites page. Only new and changed files go up, and `.env`, `node_modules` and `.git` stay on your Mac.
- **FTP and FTPS servers.** Add shared hosting accounts under Servers and browse their files.
- **Copy and paste in the terminal.** Select to copy, right-click to paste, or use ⌘C and ⌘V.
- **Updates page.** The changelog for every version, and update in one click.
- **More Liquid Glass.** Clearer panels, a lens-like sheen and lit edges.

## Download
- **Apple Silicon:** Laramac-0.10.0-arm64.dmg
- **Intel:** Laramac-0.10.0-x64.dmg

Or install and update from Terminal without the "Open Anyway" step:
`curl -fsSL https://raw.githubusercontent.com/Pino10/laramac/main/install.sh | bash`

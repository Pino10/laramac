## New in 0.22

### claudelm
The command for Claude Code on your LM Studio model is now **claudelm** (no hyphen). **claude** stays your normal Claude Code. Laramac moves an existing claude-lm over on its own.

### Site details on the Overview
Each card under Your sites has a **details** button: address, status, kind, folder, PHP or Node version, database, dev server, HTTPS, Git, .env files and the last security review, with buttons for the editor, Claude Code, claudelm, the folder, logs and its page.

### A site's page does more
- **Requests**: the site's latest requests from the web server, live, with timings, the slowest addresses, and errors highlighted.
- **Workers**: queue workers, the Laravel scheduler, Horizon, Reverb, Symfony Messenger or your own command, each with Start, Stop and its log. Laramac suggests the ones the project needs.
- **Tests**: runs Pest, PHPUnit, Vitest, Jest, Playwright, npm test, pytest, go test or cargo test, with passed and failed counts and what failed.
- **Hosting** on the Ship tab: deploy to Laravel Forge or Ploi (their deploy hook, kept in the Keychain), Vercel, Netlify or Azure App Service.
- On the overview: a **CORS** switch (pages on localhost and .test may call the site, nothing on the internet can), **Set up debugging** (Xdebug on, plus “Listen for Xdebug” in .vscode/launch.json), a **QR code** to open the site on your phone, and **Docker Compose** start and stop when the project has a compose file.

### Databases
- **Daily backups** per database (the newest 7 kept), and **Back up now**.
- **Scramble personal data** in a local copy of production: emails, names, phone numbers, addresses, IPs and birth dates become fake ones. A backup is saved first.
- **Compare the structure** of two databases.

### Ollama
Ollama is now a service like MySQL: Laramac installs it (checked against its published checksums), starts it on 127.0.0.1:11434 and keeps its models in its own folder.

### Skills from security teams
On the Code review page, add the **Trail of Bits** and **Sentry** security skill sets from GitHub. Every Claude Code review loads them next to Laramac's own, which are now **29**: audit context, entry points, threat model, variant analysis, false-positive checks, change review, insecure defaults, sharp edges and fix verification are new. Reviews stay read-only.

### Use Laramac from everywhere
Under Tools, Integrations:
- **Messages to Slack, Teams or Discord** when something fails (or also when work finishes). The webhook address is kept in the Keychain.
- **Raycast** script commands.
- **Apple Shortcuts**: commands to paste into “Run Shell Script”.
- The laramac command has **--json** and `laramac tool <name>` for scripts.


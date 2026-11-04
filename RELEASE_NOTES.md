## New in 0.19

### New projects that open
- **The Mac gets ready first.** A new project with no web server yet asks which one you want (Apache or Nginx), installs it and starts it. It starts the one you have when it is stopped, and sets up .test addresses when they are missing, so the project's address opens straight away. The window lists everything it will set up before it starts.
- Next.js and the other JavaScript starters were tested behind Laramac's Apache and Nginx: pages, scripts and live reload all pass through.

### Supabase and Firebase
- JavaScript starters (Next.js, Nuxt, SvelteKit, React, Vue, Vite, Astro, Angular, NestJS, Hono, Elysia, Expo) have a **Database** choice: Supabase, Firebase, PostgreSQL, MySQL or SQLite.
- **Supabase** runs on your Mac with the official Supabase CLI. It uses Docker Desktop or OrbStack if you have one, or installs Colima, a small free container runtime. Each project gets its own ports.
- **Firebase** runs the official emulators (Auth, Firestore, Storage, and the Emulator UI) with a demo project, so nothing connects to Google. Java is installed when needed.
- The keys go into the project's .env with the names its framework reads (NEXT_PUBLIC_, VITE_, PUBLIC_...), plus a ready client file in lib/.
- **Add Supabase or Firebase to a site you already have** from its dev server window. They start with the dev server, and Open Studio or Open Emulator UI takes you to their dashboards.

### A sidebar by stack
Overview, Sites and New project; then **Your stack** (Web servers, Languages, PHP, Databases); **Security** (Code review, Recon); Build and ship; AI and tools. Languages has its own page.

### Code review
- **More reviewers:**
  - Claude Code
  - **Claude Code on your own model** (LM Studio 0.4.1 or newer, through its Anthropic-compatible API; nothing leaves your Mac)
  - Codex
  - Gemini CLI
  - CodeRabbit (for changes)
  - your model directly
  Every one runs read-only.
- **Skills:** every Claude Code review loads Laramac's security skills (code review method, secrets, dependencies, report writing, recon, JavaScript recon, attack surface reports, and one for local models). Add your own in ~/.laramac/my-skills. **Install for Claude Code and Claude desktop** puts them in ~/.claude/skills, so every Claude Code session can use them.
- **MacSec's scanners:** when MacSec is installed, Semgrep, Gitleaks and OSV-Scanner run first and the reviewer checks each result.
- **Reviews are sessions now:** each Claude Code review is a saved Claude Code conversation. **Continue in Claude Code** opens that same conversation in Terminal to fix the findings.
- **Claude desktop:** **Connect Claude desktop** lets Claude in the desktop app review your sites, run recon and read the results through Laramac.

### Recon (new)
Map what a domain exposes, without attacking it:
- subdomains from certificate logs, subfinder and the Wayback Machine
- DNS, with possible subdomain takeovers
- which hosts answer and what they run
- old URLs and their parameters
- every script checked for **source maps**, endpoints and keys
- a few files that should never be public

Choose Passive (nothing sent to the site), Standard or Deep. Optionally, an AI writes the attack surface map and where to look first. Each recon is kept as a session, with live progress while it runs. Domains that are not on your Mac need your confirmation that you may assess them.

## New in 0.18

- **Just the newest PHP:** the PHP page offers the newest PHP and keeps it up to date. Versions you already have stay and keep working.
- **Add an older PHP yourself, the Laragon way:** download the macOS `cli` and `fpm` files from static-php.dev, press **Add a version** and choose both (archives or a folder). Laramac checks they run on your Mac and match, then sets them up.
- **Databases:** always the newest MySQL and PostgreSQL; the version boxes in Settings are gone.
- Laramac's PHP builds now make only the newest PHP, with Xdebug, and remove older builds automatically, so releases never wait behind PHP builds again.

## New in 0.17.1

- **Private review sessions:** every code review of a GitHub, Azure DevOps or other Git repository now downloads its own private copy, and that copy is deleted the moment the review finishes, whether it succeeded or not. Only the report stays. Reviews never share or reuse code, so you can run several at once.
- **Claude Code leaves nothing behind:** reviews run as one-off Claude Code sessions that are not saved to disk.
- **Web scans** remove their raw results even when a scan stops early. Anything left over from a crash is cleaned up when Laramac starts.

## New in 0.17

### Import any project
- **Every kind of project:** Laravel, WordPress, React, Vue, Next.js, Nuxt, Svelte, Angular, Django, FastAPI, Flask, Go, .NET and more. Laramac shows what it found ("Next.js project") and what it takes to run it.
- **Get it running:** install packages (Composer, npm, pnpm, yarn, bun, Python, Go, .NET), create `.env` from `.env.example` with a new app key, build the front end, create the database tables, and start the dev server. You tick what runs; the site opens when it is done, like a new project from Starters.
- **Clone from Git:** paste a GitHub, Azure DevOps, GitLab or Bitbucket address (and a token for private ones, used once and not saved). The full history comes along, so you can keep working in it.
- If a step does not finish, the import still completes and tells you which step and why.

### Xdebug
- One switch on the PHP page. While it is off, Xdebug is not loaded at all, so PHP runs at full speed. Turn it on to step through your code in VS Code, Cursor or PhpStorm.
- Laramac's daily PHP builds now include Xdebug as a separate file. Versions you already have get it the first time you switch Xdebug on.

### For the owner
- **MAINTAINING.md:** how releases, PHP builds and fixes work, without needing any chat. **CLAUDE.md** does the same for AI assistants.
- Imports now use your MySQL root password, if you set one.

## New in 0.16.1

- **Gallery menu:** the ⋯ menu on a gallery card now opens above the cards instead of hiding inside.
- **Code review, pick with a token:** paste a GitHub token, or an Azure DevOps organization and token, and press **Show my repositories** to choose from a list. The token is used once and not saved.
- **Claude Code reviews:** a clearer message when only the Claude desktop app is installed (reviews need Claude Code's command line tool), and an **Install Claude Code** button.
- **Model servers:** just the address and port is enough, like `http://127.0.0.1:8000`. Laramac adds `/v1` for the OpenAI format itself.
- **Packages check (Security):** looks up every Composer and npm package a site uses in the public lists of known security problems.
- **Key check before pushing:** Push to GitHub looks for passwords and API keys in the files it is about to send, and asks you to confirm if it finds any.

## New in 0.16

### A new icon and a sweeter sidebar
- **New icon:** three layers of smoked glass, for the web server, languages and databases, with green running lights. A matching icon sits in the menu bar.
- **Sidebar:** named groups you can fold, a glowing active item, live counts (sites and running dev servers), and Settings and Updates moved into the footer.
- **Slim mode:** press ⌘\ (or the button by the logo) for an icon-only rail.

### Dumps
- `dump()` and `dd()` from Laravel, Symfony and any project using VarDumper land in a new **Dumps** window (the bug next to the bell) instead of the page.
- Each dump shows the file and line (click to open it in your editor) and the request that made it, with a filter. Turn it on and off there.

### Sites
- **Gallery view** with a live preview of each site.
- **Logs** for each site, live, with search and an errors-only filter, from the new ⋯ menu.
- **laramac.yml project files:** save a project's setup (PHP, HTTPS, services, database, dev server, setup commands) so anyone who clones it gets the same setup in one click, after seeing every command.

### Databases and services
- **S3 storage** (RustFS) and **RabbitMQ** as services.
- **Root password** for MySQL and MariaDB, kept in your Keychain and used by phpMyAdmin, backups, imports and new projects.

### Terminal
- **The `laramac` command:** status, start, stop, open, dev, php, db and logs. **Add to Terminal** also puts Laramac's PHP, Composer and Node.js on your PATH.

### Security
- The web scan says plainly that it works on any website you are allowed to test, not just local ones.

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

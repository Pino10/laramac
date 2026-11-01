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

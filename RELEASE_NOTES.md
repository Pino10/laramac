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

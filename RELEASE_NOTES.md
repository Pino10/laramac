## New in 0.28

### Commands on every site
- **A Commands tab on each site**, with a real terminal inside Laramac. Type a command like `python3 tools/make_film.py --from-clips`, pick the folder it runs in (any folder of the site, not just tools), and press Run. Colours, progress bars and questions work, and you can type into it while it runs.
- **Python through uv, in any folder you choose.** uv brings its own Python, and when the folder (or the script's folder) has a requirements.txt, those packages are installed for that run and cached. A folder with pyproject.toml is used as a project. Ask for a version with `python3.12`.
- **Scripts it finds for you**: scripts in tools, scripts, bin and similar folders, package.json scripts (with npm, pnpm, yarn or bun, whichever the project uses), composer scripts and Makefile targets. Laramac asks before it runs one the first time.
- **Saved commands, on a schedule if you like**: every minute, every few hours or each day at a time, while Laramac is open. Each shows when it last ran and whether it worked, with its own log.
- **Laravel's scheduler in one click**: "Run it every minute" makes tasks in routes/console.php run on time, and "See what is scheduled" shows them.
- No shell is used, so text cannot sneak in extra commands. For pipes and the like, the Terminal button opens Terminal in the site with your command copied.

### A free profiler, off until you want it
- **The Profiler tab** on PHP sites shows which functions make a page slow, slowest first, by their own time or with what they call, with "Only my code" to hide the framework. Click a file to open it at the line.
- It is Xdebug's own profiler. When switched on, only the pages you profile are measured (the XDEBUG_PROFILE cookie), so everything else stays fast. "Profile this page" loads a page of the site once; pages behind a login can be profiled from your browser with the Xdebug Helper extension.

### Laravel Boost in one click
- On Laravel sites (and only there), **Install Laravel Boost** next to Artisan runs Composer and boost:install in Terminal after you agree, so Claude Code, Cursor and others know your Laravel app. Once it is in, the button updates it.

### OWASP Top 10, on every review and scan
- Code reviews and web scans now come with the **OWASP Top 10 (2025) checklist**: each of the ten says whether it had problems (and how many), was checked and looked fine, or was not checked by that run, with what would check it. The AI reviewer now names the OWASP category and CWE of each finding.

### Laramac Code, its own look and an AI that ships
- **Islands**: the side bar, editor, panel and chat float as rounded panels on a deeper base. With Fluent icons and Material file icons it no longer looks like stock VS Code. In light and dark.
- **A start page** when a project opens: the AI tools, go to a file, search, check, review, tests and the terminal. Switch it off from the page itself.
- **AI chat on your own models, ready when it opens**: Continue is in the side bar with **LM Studio** and **Ollama** (they list their own models) and the **Free LLM API**. Its agent reads your project and changes many files at once, showing each change. The Free LLM API key stays in the Keychain: the app adds it through a small relay on this Mac that only Laramac Code can use, so the key is never written to a file.
- **Laravel and scripts panel** in the Explorer: routes (loaded when you open them, click one to go to its controller method), models, migrations, Artisan actions and the project's own scripts.
- **The Laravel team's own extension**: completion and links for routes, views, config and translations.
- **Run a test from its line**: a ▶ next to every PHPUnit and Pest test (and Vitest for JavaScript), or all of them from the Testing panel.
- **More languages, all built in**: Python (with basedpyright and Ruff), Go, Rust, Java, Docker, SQL, Error Lens and Git Graph. Everything comes in one package: there is no light start.

## New in 0.27

### Laramac Code is its own app
- **A real Mac app, with its own icon** in the Dock, Spotlight and Launchpad. "Open Laramac Code", a site's code button and "Open in editor" all open it, straight into the right folder or file. It is no longer squeezed inside Laramac's window.
- **Its own windows**: no browser, no address bar. The title bar works like a Mac app's, File, Open Folder and Open Recent are in the menu bar, and each folder opens in its own window.
- **AI in the side panel on the right**, like Cursor: **Claude Code** with your Claude account opens there by default, and **Cline** works with your local model, Free LLM API or a key. The buttons at the top right show and hide the side panels.
- **Poppins really is used now** for the editor's interface when you choose it. Before, the editor refused the font quietly and fell back.
- Installed from Laramac's own release of the same version, checked against its published checksum, its signature and that it really is Laramac Code. It updates with Laramac.

### The Overview, measured
- **Live on this Mac** now shows real numbers instead of a picture: every service and dev server with its CPU, memory and how long it has been running (counting everything it started, like PHP's workers), and each site's own traffic over the last half hour.

### Ion
- **A new look, Ion**: MacSec's deep space lit in ion blue and violet, over a faint grid, with a light side too.

## New in 0.26

### Laramac Code, inside Laramac
- **Its own place in the sidebar.** Laramac Code opens inside Laramac's window, with a bar to switch sites, open it in its own window, or stop it.
- **"Open in editor" now really opens Laramac Code** unless you chose another editor in Settings. Before, an editor that was no longer on your Mac (Cursor removed, for example) gave "No code editor was found".
- **A Laramac Code app in your Applications**, for Spotlight, Launchpad and the Dock: one click on its page or in Settings.
- **Laramac's look**: Poppins or the Mac's font for the interface, rounder tabs, menus and pop-ups, the activity bar on top, no layout clutter. Code keeps a monospaced font.
- **Smarter PHP, all free**: Intelephense for completion and errors, now with **Phpactor** for rename, extract, import and generate. Phpactor's own suggestions are off so you never see everything twice; Intelephense's paid extras stay off.
- **Laramac Checks**, built in: when you save a PHP file, PHP's own syntax check, PHPStan (the project's, or the one from the PHP page) and Psalm (when the project has psalm.xml) show their problems in the editor. "Check the project" adds Semgrep when MacSec is installed.
- **Reviews with skills, from the editor**: "Review with AI" asks Claude Code, your local model or Free LLM API to read the file or project with Laramac's skills and Laravel's own, and shows what it finds in the Problems panel. It only reads.

### Laravel's own skills
- **Laravel Boost's skills**, from Laravel (MIT): Laravel best practices with a rule for each topic (security, Eloquent and N+1, validation, queues, caching, routing), Tailwind CSS 4 and Pennant. They come by default and are picked for Laravel projects. The paid Flux UI Pro and Laravel Cloud skills are left out.

### A sidebar that reads better
- **Starter** (was New project) and **Laramac Code** at the top.
- **PHP lives in Languages** now: every language is a card. PHP opens its versions, settings and tools; Node.js opens its versions to install side by side.

### The Overview
- **Requests today**, bigger and clearer, with mail, backups, the median time and security beside it. Server errors became a small red note when there are any.
- **Live on this Mac**: your sites and services in orbit around your Mac, with requests flowing in, faster when traffic is busier.
- **A round plus** to start a project, and **Shortcuts** as app icons (phpMyAdmin, Mail inbox, Services, Projects folder, Import).

### Every look, light and dark
- **Like my Mac, Light or Dark**, for every look, so you can switch without waiting for the evening.
- **Prism** replaces Midnight: glass with a rainbow edge over slowly moving light.
- **Studio** has clearer, deeper glass. Smoked, Aurora and Frosted have a proper light and dark side each.

### Also
- **Packages** shows an Update button where there is an update.
- **API client**: a useful start screen, and the response's time (green when fast), size and type at a glance.
- **Burp Suite Professional** shows as Professional on AI tools.
- **Settings** introduces Laramac Code and MacSec.

## New in 0.25

### Laramac Code: a code editor built in
- **Your own editor inside Laramac**, based on code-server (the open-source VS Code for the browser). It runs only on this Mac, behind a password Laramac makes for each start, and opens in its own Laramac window.
- **Made for PHP first.** Intelephense for smart PHP completion, go to definition and errors as you type; Xdebug for step-through debugging; Blade, .env and EditorConfig support. JavaScript, TypeScript, CSS, Tailwind, Vue, JSON and YAML too, with Prettier and ESLint. Install more from Open VSX.
- **Its terminal knows your setup**: Laramac's PHP, Composer, Node.js and the PHP tools are on its PATH.
- **The same editor for .env, php.ini and config files.** "Open in editor" uses Laramac Code when you have no other editor, or when you choose it in Settings. Each site has an **Open with** button for your other editors.
- **Fonts you choose**: SF Mono, JetBrains Mono, Fira Code, Cascadia Code or Menlo, at the size you like. Light and dark follow your Mac, with Studio themes in your accent colour.
- Downloaded from code-server's GitHub release and checked against GitHub's SHA-256 before it runs. Updates appear on the Updates page.

### For PHP developers
- **Quick settings** on the PHP page: memory, upload size, time limit, errors on the page and OPcache, one click each, for every PHP version.
- **PHP tools**: the Laravel installer, PHPStan, Pint, PHP CS Fixer, Rector, Psalm and PHPUnit, installed with Composer and ready in the terminal.
- **Artisan** on every Laravel site's page: migrate, clear caches, routes, Tinker, tests, storage link, and a fresh database (it asks first).
- PHP update checks run as before, on the Updates page.

### A livelier Overview
- **Your Mac's pulse**: requests today with a live chart, server errors, mail caught, your last backup and your last security review. Numbers count up and the chart draws in; with Reduce Motion on, everything stays still.

### Studio, your colour
- **Studio follows your Mac**: light in the day, dark at night, and the light look is now a proper one.
- **Pick an accent** (blue, violet, teal, amber or rose) and the interface font (the Mac's own or Poppins). Every other look is still in Settings.

### Smarter code reviews
- **Choose the skills for each review.** The ones that fit your project's stack are on; switch any on or off, and the time estimate follows. More skills is not always better.
- **The best skill packs come by default**: Trail of Bits, Sentry, Cloudflare (with its 14 reference guides) and Anthropic. Remove one and it stays removed.

### Tidier
- **Notifications** are small toasts that go away by themselves, and a slim list behind the bell.
- **Jobs** show as one small pill while something runs.
- **Assistant** is now a tab in AI tools. **Recon** lives in MacSec, where the security tools are.

## New in 0.24

### A cleaner Laramac
- **A sidebar by task.** Run (Services, PHP, Languages, Databases), Check (Code review, Recon), Ship (Git, Remote servers, API client) and AI (Assistant, AI tools). Packages, Updates and Settings sit at the bottom.
- **Services**, a new page: Apache, Nginx, PHP, the databases, cache and queues, storage, mail and Ollama, each group with what it is for, plus the map of how your sites connect and the mail inbox and public links.
- **"Web servers" was really your remote machines**: it is now called Remote servers, under Ship.
- **A calmer Overview**: your sites, your services as small tiles, and four shortcuts.
- **Every page on one spacing scale**, with titles that match the sidebar (Code review, New project, Git, AI tools, Remote servers) and sections that line up.
- **Sites rows** keep three everyday actions (open, editor, AI tool); the rest are named in the ⋯ menu.
- **Narrow windows**: the sidebar slims down on its own, lists and tabs reflow, nothing runs off the edge.

### Your own editor
Laramac finds the editors and IDEs on your Mac (VS Code, Cursor, Windsurf, Zed, Sublime Text, PhpStorm, WebStorm, IntelliJ IDEA, PyCharm, GoLand, Rider, Nova, Xcode and more, including JetBrains Toolbox installs) and opens the one you choose, at the right line. If the one you chose is removed, it uses the next one it finds. "Choose another app" takes any app. It is in Settings, Terminal and editor.

### Releases
Each release now carries only its own notes, and is published as a normal (latest) release.


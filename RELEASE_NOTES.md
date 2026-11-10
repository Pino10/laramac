## New in 0.38.0

### Updates you can actually see
- **Databases:** MySQL, PostgreSQL and MongoDB that Laramac installed now show newer releases of the same version line, with one button to update. Your databases are not touched, and the server restarts if it was running.
- **PHP:** a newer PHP line than the ones you have (for example 8.6 when you have 8.5) now shows up by itself, in Updates and on Packages under "Newer versions you can add". It installs next to your current one.
- **Homebrew:** Laramac now refreshes Homebrew's own list of new versions before checking (at most every six hours), so Apache, Nginx, MariaDB, Redis, Memcached and RabbitMQ updates are no longer missed.
- **Packages page:** shows when it last checked, has a "Check for updates now" button, and checks by itself when you open it.

### Notifications no longer pile up
A burst of notifications now stays in place instead of stacking on top of each other and jumping to the top. At most three show at once, the same message replaces itself, errors stay, and the rest wait in the bell ("2 more are waiting in the bell").

### Security skills
Six new review skills for mobile apps (Android, iOS), GraphQL, servers and networks, and cloud accounts.

## New in 0.37.0

### Recon now shows proof
Recon no longer only points at things that might be wrong. When it can, it **confirms** them by reading the real file or page, and keeps the proof next to the finding.

- **Confirmed** means the problem itself was seen: a folder listing, a real .git or .env file, a readable source map, an error page that shows code details, a site that accepts a made-up origin, or a CDN or firewall answering. **Possible** means the evidence points at it but does not prove it, such as a version that matches a known issue.
- Each proof shows the request, the answer's status and size, a fingerprint of what was read, the time, and a command you can copy to repeat it yourself. Secret values are never stored: a .env file shows only the setting names.
- New checks: folder listings, about 40 more risky files (Git, Subversion, backups, dumps, keys, debug pages), CDN and firewall detection, error pages, cross-origin sharing, advertised methods, and versions of web servers and scripts matched against the public NVD list.
- Version matches are always "Possible", never critical, and a Linux package may have been fixed without changing its version number.
- A "Confirmed only" switch hides everything that is not proven.

Nothing is exploited. Recon only reads, with short fixed lists of paths, and never guesses passwords or sends data that changes anything.

## New in 0.36.1

### Fix
- Changing the look and then opening Laramac Code no longer flashes "The workbench failed to connect to the server". The editor now restarts first (open windows show "Applying the new look…" meanwhile) and your windows come back to their folders.

## New in 0.36

### Laramac Code: ten looks, three of them new
- **Notepad**: feels like Notepad++. Light grey chrome, coloured tab bars, a ruled status bar, no icon bar.
- **Ember**: feels like Sublime Text. Warm dark, a minimap, no icon bar, almost no lines.
- **Orbit**: feels like Antigravity. A wide agent panel on the right with a gradient edge, flat dark panels, gradient accents.

### Fixes
- **Rounded corners** in Aurora and Sunset no longer clip the corners of panels and icons: smaller radius, and the pill around the bottom icons is gone.
- **Closing Laramac Code takes one try.** The editor's "something is still running" question blocked the first close; closing now just closes (files save by themselves after a short pause).
- **Poppins in Laramac Code**: the font is now loaded in two ways and the editor page is allowed to use it. Laramac Code writes whether it loaded to its log (~/.laramac/code/app.log).

## New in 0.35

### Laramac Code: seven looks that rearrange the editor
Each look now changes where things sit, what the tabs, buttons and status bar look like, and the colours. The features are identical.
- **Studio**: a classic IDE feel. Narrow tool strip, grey flat panels, underlined tabs, a path bar on top.
- **Classic**: a VS Code feel. Icon bar on the left, minimap, a bold coloured status bar.
- **Zen**: a Zed feel. No icon bar, almost no chrome, soft tabs, a tiny status bar.
- **Aurora**: agent-first. The AI panel stays open on the right, in floating glass cards.
- **Sunset**: warm plum and amber glow, the icon bar along the bottom, big soft corners.
- **Terminal**: green on near-black, monospace everywhere, block cursor, relative line numbers, side bar on the right.
- **Mono**: pure black and white, with an inverted status bar and hairlines. Light mode is white with black.
Changing look sets the arrangement once, so anything you move yourself afterwards stays until the next change. Paper and Carbon (0.33 and 0.34) became Zen and Studio.

### Quieter editor
- The "Initializing virtual environments" message came from Python's background search for virtual environments. That search is now off in Laramac Code, and files save automatically after a short pause so closing a window rarely has anything unsaved.
- One version number on the Laramac Code page (the app's, the same as Laramac).

## New in 0.34

### Laramac Code: dark, light, and five looks that really differ
- **Dark or light** for Laramac Code now follows Laramac by default. Under Laramac Code, **Dark or light** lets you choose Dark, Light or Match my Mac for the editor alone. The editor window changes with it.
- **Five looks**, each with its own layout and its own colours, so you can see the difference at a glance: Aurora (indigo glass), Paper (warm and flat), Carbon (graphite, sharp), and the new **Sunset** (plum and amber glow) and **Terminal** (green on near-black, monospace). Sunset and Terminal bring their own accent colour; the others use yours.
- Changing the look restarts the editor quietly and brings your windows back to their folders.

### Fixes
- One version number: the Laramac Code card now shows the app's version (the same as Laramac), not the editor engine's.

## New in 0.33

### Laramac Code: three looks to choose from
Open **Laramac Code** in Laramac and pick **Choose a look**. Each one is a different layout, not just a colour:
- **Aurora** (the new default): soft floating glass cards on a glowing backdrop, pill tabs and a floating status bar.
- **Paper**: one calm, flat page with almost no lines, text tabs with a thin underline and a quiet status bar.
- **Carbon**: dense and sharp, with accent edges, small capital section titles and a console-style status bar.

If Laramac Code is open, it changes within a minute. Your accent colour and fonts still apply to all three.

### Laramac Code tells you when Laramac has an update
When a newer Laramac is out, a small banner appears at the top right of Laramac Code. **See what is new** brings Laramac forward on the update; the cross hides it until the next version.

### Fixes
- **Remote servers, Health** now works on servers you saved with an older Laramac (it wrongly said they needed SSH).
- **Server cards**: Terminal, Health and Files fit inside the card instead of spilling out.

## New in 0.32

### A clearer start on every page
- **Sites, Languages, Databases and Services** now open with a row of animated numbers: how many sites, dev servers running, sites on HTTPS, languages ready, PHP and JavaScript sites, database servers, total database size, services running or failed.
- **A line that says what to do next**, with the button that does it, appears only when something is off: dev servers stopped (Start them), services off (Start all), no database server running (Start it), or JavaScript sites without Node.js (Choose a version).
- **Databases** show each database's size as a bar next to its number, so the big ones stand out.

## New in 0.31

### Remote servers: a live Health tab
Open a Linux server and choose **Health**: animated rings for how busy it is, memory and disk (they turn yellow at 75% and red at 90%), a load graph, how long it has been up, swap, and which of Nginx, Apache, PHP-FPM, MySQL or MariaDB, PostgreSQL, Redis, Docker, Supervisor, Cron, SSH, Fail2ban and the firewall are running. It reads every 10 seconds over one quiet connection, asks with one fixed command that only reads, and changes nothing on the server. It uses the same key checks and trusted fingerprint as the terminal.

### Dark by default
Laramac now looks like its pop-ups: dark smoked glass. If you were on "Like my Mac", you move to Dark once. Light and Dark choices stay, and you can pick "Like my Mac" again in Settings, Look.

### A better reviewer picker
In Code review, the reviewers are now cards, each with a line about what it is and a clear "Not set up" tag, instead of one long pill.

## New in 0.30

### Better flows
- **After you clone, you know what to do.** Cloning from GitHub or Azure DevOps now shows a card with **Open it** (set it up and run it) and **Review its code**, which opens Code review already pointing at that project.
- **Code review is two clear steps.** 1. What to review. 2. How to review it: a **Standard review** (one careful read by the AI you pick) or a **Deep audit** (Cloudflare's and Anthropic's published reviews). Only the options for the one you choose are shown, so the page is shorter and nothing is out of order.

## Fixes in 0.29.1

- **Pop-ups and dialogs are readable.** Dialogs such as Import a project, the Activity panel and menus now sit on a solid, softly blurred surface, so the page behind no longer shows through the text.
- **Tooltips are solid** and no longer hang off the edge of the window (the buttons at the bottom left of the sidebar used to).
- **Azure DevOps looks like GitHub.** Repositories are now cards in a grid, with the project, branch, size, a clear Clone button and a Details button for branches, commits, pull requests and pipelines.
- **Poppins is the default font** in Laramac and Laramac Code. If you already chose a font, it stays. You can still switch to the Apple font in Settings.
- **Calmer buttons.** One family of rounded buttons with soft hover and press, clear keyboard focus, and the same look on every page.

## New in 0.29

### Deep audit
A new **Deep audit** section on the Code review page, for projects on this Mac, in GitHub or in Azure DevOps. Pick a method, then the AI to run it with:
- **Cloudflare security audit**: the most thorough. AI agents map the project, hunt each kind of attack, and a fresh agent tries to disprove every candidate before it counts. About 45 minutes to 3 hours.
- **Claude Code security review**: Anthropic's own review, one careful pass that reports only high-confidence problems. About 5 to 25 minutes.
- **Both**, one after the other.
- **Run it with** Claude Code, Claude Desktop (Laramac copies the request and opens the Claude app), claudelm (your model in LM Studio) or claudefree (Free LLM API).
- **It tells you what it is doing** before it starts: which AI, which method and version, what it reads, what it writes, and where your code goes.
- **Read-only, and checked.** Your project is measured before and after, and you are warned if anything in it changed. Every finding is checked against Cloudflare's report format, and each file and line it cites must really exist, otherwise it is shown as "needs checking" instead of confirmed.

### Skills you can update
Skill packs now say when a newer version exists, with a link to see what changed and an **Update now** button. Laramac checks once a day, tells you once, and never updates anything until you press the button.

### Messages you can see
Notifications now appear at the top right, where you look. Errors stay until you close them, the others fade after a while (hovering keeps them), and clicking one opens it full size with a Copy button.

## Fixes in 0.28.1

- **Claude app connection now works.** The Claude app starts helpers with a short PATH that often has no Node.js, so the old entry (npx and mcp-remote) could not start and showed "Server disconnected". Laramac now gives the app a small script that only needs curl, which every Mac has. The token is no longer copied into the app's config: the script reads it from Laramac's own file. If you connected before, Laramac fixes the entry by itself the next time it opens. Restart the Claude app afterwards.
- **laramac, claudelm and claudefree work in the installed app.** They used to borrow the app as Node.js, which the installed app does not allow. They now look for a real Node.js each time (the one Laramac installs, then your own) and say plainly if there is none.

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


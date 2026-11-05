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


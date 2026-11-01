## New in 0.13

### Starters: every stack in one click
- **A new Starters page** with more than 30 frameworks: Next.js, Nuxt, SvelteKit, React Router, Astro, React, Vue, Angular, Vite (Solid, Preact, Svelte, Lit, Qwik), Laravel with the React, Vue, Svelte or Livewire starter kit, Symfony, Statamic, Drupal, Craft CMS, Slim, CodeIgniter, NestJS, Hono, Elysia, FastAPI, Django, Flask, Streamlit, ASP.NET Core, .NET apps, Go, Rust, Expo, Tauri, Electron, SwiftUI, Vapor and Swift packages.
- **Always the newest version.** Each starter runs the framework's own official setup tool. Cards show the latest release.
- **One click does everything:** installs the language if it is missing, creates the project, the database and `.env`, runs migrations, installs packages and makes the first Git commit.
- **Languages tab.** Node.js, Bun, Python (uv), .NET, Go and Rust, installed from their official sources with checksums verified, kept inside Laramac's folder, and updated from here. Copies you already have are used.

### Dev servers at name.test
- JavaScript, Python, C#, Go, Rust and Swift projects run their own dev server from the Sites page and open at `name.test`, live reload included, through Apache or Nginx.
- Start, stop and watch the output. Stopping also stops everything the server started.
- Existing JavaScript projects get a **Set up dev** button.
- When a dev server is off, `name.test` says so and reloads by itself once it starts.

### Smoked glass
- A new look: dark, tinted glass with a strong blur and fine lit edges, for pop-ups, menus, tooltips and, with the default Smoked style, the whole app. Frosted glass is still in Settings.

### Fixed
- The PHP version picker no longer slides under the HTTPS switch on the Sites page.

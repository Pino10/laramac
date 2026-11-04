## New in 0.21

### Node.js per project
- Each site runs on the Node.js version it asks for: .nvmrc, .node-version, .tool-versions, Volta or "engines" in package.json. You can also pick one on the site's page.
- Laramac installs the version for that project only (checked against nodejs.org's checksums); other sites keep theirs. Its dev server, package updates and setup steps all use it.
- In Terminal, node, npm and npx switch on their own when you are inside a project folder.
- Languages lists every Node.js line, with Install, Update and Remove. The Doctor offers **Install Node 18** (or whichever) when a site needs one you do not have.

### Updates for everything
- The Updates page now shows everything Laramac looks after, with what you have and what is new: Laramac, PHP, Node.js, other languages, Homebrew services (Apache, Nginx, MariaDB, Redis, Memcached), Composer, phpMyAdmin, Cloudflare Tunnel, Claude Code, and each site's npm and Composer packages.
- **Update all**, or tick what you want. Services restart if they were running.
- A site's packages only update when you agree, because npm and Composer run the project's own install scripts. Laramac saves a snapshot first, and only installs versions the project already allows. Bigger jumps wait on the site's Packages tab, with **Update to** per package.
- Laramac looks once a day (if you let it) and puts a dot on Updates.
- The changelog shows what is new since your version first, and marks changes that touch what you use.

### Claude everywhere
- **Set up Claude everywhere** (Tools) does it all in one go: Claude Code connected to Laramac, the Claude desktop app connected, the security skills installed, and the commands added to Terminal.
- **claude-lm**: a new Terminal command that starts Claude Code on your model in LM Studio, while **claude** stays your normal Claude Code. Everything you type after it is passed on, so `claude-lm --resume` works. `claude-lm --lm-models` lists your models and `--lm-model` picks another one for that session.
- **No more "context too small".** Before claude-lm or a review on your model starts, Laramac asks LM Studio what context the model was loaded with and, when it is too small for Claude Code, loads it again with enough (64k tokens, or the most the model allows). It tells you when a model is simply too small.
- The Claude app connection now works even when Node.js is not on its PATH.
- An LM Studio API token, if you use one, is kept in the macOS Keychain.

### GitHub and Azure DevOps
- **Azure DevOps** has its own tab: connect with a personal access token, see every repository by project, its pipelines, pull requests and commits, open a pull request, create a repository, and clone it. The token is encrypted in the Keychain and sent only to dev.azure.com.
- Push a site to Azure Repos from its page (Ship, then Push to Azure DevOps): main, a new branch or a version tag.
- GitHub repositories show their latest **Actions** runs.

### API client
- **Your sites are environments.** Each site gives you {{base}}, its address and the non-secret URLs from its .env.
- **Requests from a site's code**: Laramac reads Laravel, Next.js, Express, Fastify, Hono, NestJS, FastAPI and Flask routes (and OpenAPI files) and makes a collection, without running anything.
- **GraphQL** bodies with variables; **API key** and **OAuth 2** (client credentials) sign-in; cookies kept between requests like a browser (and a switch to turn that off).
- History opens a past request again.
- Code in more languages: HTTPie, axios, Laravel's Http, and Go.

### Settings
- **Search** every setting: type "port", "theme" or ".test". Settings also appear in ⌘K.

### Security reviews and recon
- Twelve new review skills, so reviews cover far more ground: API security (OWASP API Top 10, GraphQL, webhooks), sign-in and sessions (JWT, OAuth, password reset, MFA), every kind of injection, browser-side issues, business logic and races, Docker and CI configuration (GitHub Actions, Azure Pipelines), supply chain, personal data, Supabase and Firebase rules, AI features, and Electron apps. A **review-vectors** plan makes every review say which areas apply.
- Recon asks five more free public sources for subdomains (CertSpotter, AlienVault OTX, HackerTarget, urlscan.io and Anubis). None of them contacts the site itself.


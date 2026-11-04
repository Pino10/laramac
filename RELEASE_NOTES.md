## New in 0.20

### Every site has its own page
Click a site's name to open it. Everything about that site is in one place:
- **Overview:** whether it answers and with what, its stack (framework, PHP or Node version, database, Git), Start and Stop, open in your editor, in Claude Code or in Finder, and cards for the Site Doctor, snapshots, the latest security review and shipping.
- **Logs:** the dev server's live output and the web server's logs for the site.
- **Database:** the site's tables, with a read-only query box (SELECT, SHOW, DESCRIBE and EXPLAIN).
- **Environment:** edit .env, .env.local and the development ones. Secret values stay hidden until you choose to show them.
- **Packages:** outdated npm and Composer packages, with the newest version and how big the jump is.
- **Security:** the latest review as a list of findings, each with **Fix with Claude Code**, **Fixed**, **Accept the risk** or **Not a problem**.
- **Ship:** push to GitHub, share a public link or deploy.

### A doctor that checks on its own
Overview checks every 30 seconds whether the web server runs, .test addresses work, services are up, dev servers are started and each site answers without errors. Each problem comes with the reason and a **Fix** button (start the web server, set up .test addresses, restart a service, start a dev server, or open the site's logs). When a port is taken, it says by what.

### Overview and activity
- **Your sites** on the Overview: up to eight sites with Live or Start, and a New project card.
- Long jobs collect in one **activity** area at the bottom that you can fold away.

### New project
- **Recipes** for common apps: a SaaS app (Next.js and Supabase), an app with an admin panel (Laravel, React and Filament), a real-time app (React and Firebase), a blog, and an API with a database (NestJS and PostgreSQL).
- **From a Git repository** sits next to them.

### Code review and recon
- Reviews are split into findings you can act on and mark, and the full report is still there.
- Recon can **compare** with the previous run (new and gone subdomains, endpoints and findings) and **export** a URL list for Burp or ZAP, a CSV, or a Markdown report.

### Smaller things
- Databases: click a database to browse its tables, and copy a connection string.
- Sites: filter by Live, PHP, JavaScript or Other.
- Assistant: quick questions to start from.
- Settings: jump to a section.
- PHP: search extensions.
- **A new icon:** three glass layers and a spark.


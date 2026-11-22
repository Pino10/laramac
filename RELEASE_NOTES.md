## New in 1.1.4

- **DeepSeek for Claude Code.** A new ready-made server, "DeepSeek for Claude Code", uses your DeepSeek key in the format Claude Code speaks. Add it in Model servers, pick its model in the Assistant, then choose the reviewer "Claude Code on your own model". The key stays in the Keychain and goes to Claude Code only for that run. The existing "DeepSeek" server still works for the reviewer "Your model" (the API).
- Reviews and recon that run on an online model now say that the code is sent to that provider.
- Not tried against a live DeepSeek account here. The model names (deepseek-v4-pro, deepseek-v4-flash) come from DeepSeek's documentation.

## New in 1.1.3

- **Remove a site.** The menu on every site has a new Remove site option. Laramac stops the site, moves its folder to the Trash so you can put it back, and tells you plainly that anything the app saved inside that folder goes with it. Your languages and packages stay.
- **Your apps on the Services page.** Python, Node.js and other apps that run their own server now show at the top of Services, with their port, whether they are running and a switch to start or stop them.

## New in 1.1.2

Python apps now go from "not found" to running in one click.

- **A clear "set it up" banner.** A project that comes with a `laramac.yml` now shows a banner at the top of Sites, not only a small tag.
- **It starts the app for you.** After you press Set it up, Laramac installs what the project needs and starts its dev server, so the site opens without another step.
- **Python apps are recognised.** A folder of Python scripts, such as Invariant, is now labelled Python instead of Static. Websites with a home page and a helper script stay static.
- **Python setup tells you when it fails.** If Laramac cannot add its own Python after an update, you now get a notice, and it works around a changed uv option.

## New in 1.1.1

Python projects now work properly in Laramac.

- **Laramac's own Python for your projects.** A project's setup such as `python3 -m venv .venv` and `pip install` used to run with the old Python that comes with macOS, or ask you to install developer tools first. Laramac now puts its own `python`, `python3` and `pip` first, so Python projects set up the same way on every Mac.
- **Python stays inside Laramac.** It is kept in Laramac's own folder, not in your home folder. If you already had Python from the Languages page, Laramac adds the missing pieces once in the background.
- **Languages in Packages.** The Packages page now lists Python, Node.js, Bun, uv, Go, .NET and Rust, with their size and a way to remove each one.

## New in 1.1.0

Remote servers, rebuilt: faster and safer file copying, a real terminal, and help from Claude when you ask for it.

### Copying files
- **A progress bar at the bottom** whenever something is copying: percent, files, size, speed and time left, with Pause, Resume and Stop.
- Several files copy at once, and a failed copy tries again by itself. Settings lets you pick how many at once and a top speed.
- Copies are safe: a half-finished file never replaces a good one, and Stop cleans up after itself.
- Uploading again skips files that have not changed. Folders skip junk like node_modules.
- Drag files in from Finder. Download files and whole folders.
- Uploaded files keep sensible permissions and are no longer open to everyone.

### The file browser
- Sort, filter, search the whole server, show hidden files, pin favourite folders.
- Right-click for: edit in the app, download, zip, open an archive, rename, permissions, copy path, move to the bin, delete forever.
- A bin on the server (`~/.laramac-trash`) so a delete can be undone.
- A text editor that keeps the file's permissions when saving.
- "Open a terminal here" and "Add my key to this server".

### The terminal
- Up to six tabs, saved commands as one-click buttons, font size, save the session to a file.
- It reconnects by itself if the line drops.
- **Asks before risky commands**: a big paste, or something that deletes folders, wipes a disk or switches the server off, shows what it will do first. This also covers your saved command buttons.

### Safer servers
- Mark a server as Production, Staging or Development. Production shows a red stripe, and deleting there asks you to type the server's name.
- **Read only** servers: you can look and download, nothing else.
- **Touch ID lock** for the Remote servers page (Settings).
- A private activity log of what Laramac did on each server, kept on your Mac with secrets removed.
- Laramac refuses to upload your own keys and password folders (.ssh, .aws and so on).
- Make a new key right in the app, and import servers from your SSH settings.

### Claude help (off until you turn it on)
- Settings, Remote servers, Claude help. Then **Troubleshoot** and **Ask Claude** appear on a server.
- Laramac runs a fixed read-only check, removes secrets from the result, and saves a report on your Mac. Claude Code or the Claude app reads that report. Claude never gets your password, key or access.

### Notifications
- Notifications are now clear and professional: no more empty notices. Unread dots, and buttons like Show in Finder or Open.

### Known limits
- The speed limit works for SFTP, not FTP.
- Touch ID and opening Claude from the app could not be tested outside a real Mac.
## New in 1.0.0

Version 1.0: a full review of every screen, with pages made shorter and clearer.

### First run
- **What do you build?** PHP sites, JavaScript apps or both. Setup then shows only what fits.
- The tour is five stops and is offered, not forced.
- The Overview shows one setup card, not the whole service list again.

### Sites
- Every site row says whether it is ready, stopped or needs setup, and its buttons have words.
- A banner tells you when your sites cannot open yet, with the button that fixes it.
- A site's tabs are grouped (Run, Data, Logs and so on) and fit on one row. Extra names moved to the site's own page.

### Code review, rebuilt as three steps
- What to review, who reviews it, start. Only reviewers that are set up are shown, and a greyed-out Start button says why.
- **Explain simply** and **Copy as an issue** on findings.
- Skill sets from other security teams are no longer downloaded on their own: Laramac asks first.

### AI tools
- Four plain choices: use my Claude account, use a model on this Mac, use free keys, other tools. Each shows only what it needs.

### Settings and Updates
- Settings is six tabs, with Appearance first. Help text is no longer cut off.
- Updates shows the newest notes and folds the rest away.
- "Starter" is now "New project". Packages, Updates and Settings have labels.

### Laramac Code
- **Safer:** a project's own code (tasks, debuggers, extensions that run it) now only runs after you say you trust the folder. You are asked once, and one tick covers your whole projects folder.
- **Faster start:** a new install gets the core extensions. Python, Go and Rust extensions come when you have a project in that language, and the rest are one click away.
- Checks on save wait for a pause, so auto-save does not run them over and over.

### Fixed
- The activity panel pushed the top bar off the screen.
- Wrong numbers: the skill count, the size of Laramac Code, and Databases counting things that are not databases.
- The copy button next to addresses was invisible.


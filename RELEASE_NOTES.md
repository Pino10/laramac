## New in 0.12

### GitHub
- **Create a repository from Laramac.** Pick a name, description, private or public, and an optional README. It can also be cloned straight into your projects folder.
- **Repository details.** Click a repo name to see its branches, releases, recent commits, open pull requests and issues.
- **Delete a repository.** Type its name to confirm. If your token lacks the delete permission, Laramac says exactly which one to add.
- **Download as ZIP** to any folder, and **Pull latest** into a site that is already linked.
- **Push anywhere.** The push dialog still picks the linked repo, but you can now push somewhere else or create a new repo from the same place. You still choose main, a new branch, a version tag or a release.

### Servers
- **Upload a whole folder** over SFTP or FTP, not just single files.
- Downloads and uploads default to your www folder.
- **Add a server from the Deploy dialog** without leaving it.

### API client
- **Works like Postman.** Import Postman collections (folders included) and Postman environments, then edit, run and save inside them.
- **Folders** in the sidebar, which you can collapse, run and add to.
- **Tests** on each request: status, response time, a header, a JSON value or body text. Results appear next to the response, and the sidebar shows which requests pass.
- **Save values** from a response into the environment, such as a login token, so the next requests can use it.
- **Collection runner.** Run a whole collection or folder in order and see what passed.
- **Collection variables**, rename, duplicate, move to a folder, delete.
- **Export** a collection back to Postman, and **copy any request as code**: cURL, JavaScript, PHP or Python.
- A cleaner layout.

### Fixed
- Tooltips on the first site row were cut off.
- Updates and PHP downloads work while the repository is private, using the GitHub account connected in Laramac.

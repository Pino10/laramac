## New in 0.23.2

### Checking for updates no longer stops with 403
GitHub only answers about 60 questions an hour from apps that are not signed in, shared by everything on your network. Laramac's update check, the Updates page, tool installs and version lookups used them up, and then GitHub answered 403. Now:
- When you connected GitHub on the GitHub page, Laramac uses that sign-in: 5,000 an hour.
- Answers are kept for ten minutes and asked again in a way GitHub does not count when nothing changed.
- When the hour is used up anyway, update checks read GitHub's release feed instead, which has no limit, and Ollama, Nuclei and subfinder installs find their files the same way.
- If nothing works, Laramac says when GitHub's limit comes back instead of showing a number.


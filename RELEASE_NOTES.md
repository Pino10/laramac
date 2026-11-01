## New in 0.15

### Security
- **Code review** of a site in www, a GitHub repository, or any Git address including **Azure DevOps** (with a token for private ones, used once and not saved).
- Reviewed by **Claude Code** (read-only: it can read and search, not change or run anything) or by **your own model**.
- Reports list each problem with its severity, file and line, what is wrong and the fix. **Fix with AI** opens your coding agent in the project with the request ready to paste.
- A built-in check finds **leaked keys and passwords** in files.
- **Web scan** with Nuclei against a local site or an address you are allowed to test, without harmful checks, with **Explain with AI**. Laramac installs Nuclei the first time.

### Every model server you use
- Add any address in the **OpenAI or Anthropic format**, with an API key if needed: other ports, another machine, or Anthropic, OpenAI and OpenRouter. Keys stay encrypted in your Keychain.
- Found by themselves: LM Studio, Ollama, **vMLX and oMLX** (port 8000), Jan, GPT4All and llama.cpp.
- Each server shows if it answers, with **Test** and **Use**. **oMLX** and **Burp Suite** have their own cards.

### Mail delivery
- Mailpit still keeps every email. It can now also send mail for real through Resend, Mailtrap, Postmark, SendGrid, Mailgun, Amazon SES, Brevo, Gmail or any SMTP server: everything, or only what you release. Send a test email to check.

### Public links without an account
- New: **localhost.run** and **Pinggy**, over the SSH every Mac has. A small relay makes sure a link only reaches the site you shared.

### Glass styles
- Two new styles, **Aurora** and **Midnight**, picked from live previews in Settings.

## New in 0.23

### Studio: a new look, and the default
Solid dark surfaces in calm greys and a soft blue, like Google's dark apps, with Apple's own font, rounding and fine lines. The page you are on is a filled blue pill, the main button is filled blue, and nothing is see-through, so text is easy to read all day. Everyone gets it once with this update; Settings, Look switches back to Smoked, Aurora, Midnight or Frosted.

### Free LLM API
Connect Free LLM API on the Tools page: paste its unified key once (it goes to the Keychain) and every free key you added to it works through one address.
- **claudefree**: a third way to run Claude Code, next to **claude** (your Claude account) and **claudelm** (LM Studio). `claudefree --free-model auto:fast` picks the fastest model for one session, `claudefree --free-models` lists them. Every other argument passes through to claude.
- **Code reviews** can run on it: choose “Claude Code on Free LLM API”.
- **The Assistant** gets it as a model server, with auto (your routing chain) and auto:fast.
- A claudefree button on every site's page and in the site details.
- Code reviews flag Free LLM API keys left in files.

### Skills from Cloudflare and Anthropic
Two more skill sets on the Code review page:
- **Cloudflare's security audit**: reconnaissance, hunting by attack class (web and sign-in, client side, cloud, data isolation, supply chain, AI apps, desktop and local IPC, protocols, memory safety, resource exhaustion) and checked findings with evidence.
- **Anthropic's /security-review**: a senior engineer's review of your changes that reports only high-confidence problems. It becomes a skill for reviews and stays a /security-review command in Claude Code.


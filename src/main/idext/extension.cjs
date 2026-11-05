/*
 * Laramac Checks: the extension Laramac installs into Laramac Code.
 *
 * Free checkers run when you save (PHP's own syntax check, PHPStan, Psalm when the project has a
 * psalm.xml) and show their problems in the editor. "Check the project" adds Semgrep when MacSec is
 * installed. "Review with AI" asks Claude Code (your account, your local model through claudelm,
 * or Free LLM API through claudefree) to read the file or project with the skills Laramac has
 * (its own, Laravel's, Trail of Bits, Sentry, Cloudflare and Anthropic), read-only, and shows
 * what it finds the same way. Nothing here changes your code.
 *
 * Plain JavaScript on purpose: Laramac builds it into a VSIX when it installs Laramac Code.
 * The parsers at the bottom are pure and tested with real tool output.
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFile, spawn } = require('child_process')

// ---------------------------------------------------------------- Parsers (pure)

/** php -l: "PHP Parse error:  syntax error, unexpected ... in /x/a.php on line 12" */
function parsePhpLint(out, file) {
  const res = []
  const re = /PHP (Parse|Fatal) error:\s+(.+?) in (.+?) on line (\d+)/g
  let m
  while ((m = re.exec(out))) res.push({ file: m[3] || file, line: Number(m[4]), severity: 'error', message: m[2].trim(), source: 'PHP' })
  return res
}

/** phpstan analyse --error-format=json */
function parsePhpstan(text) {
  let d
  try {
    d = JSON.parse(text.slice(text.indexOf('{')))
  } catch {
    return []
  }
  const res = []
  for (const [file, v] of Object.entries((d && d.files) || {})) {
    for (const m of v.messages || []) res.push({ file, line: m.line || 1, severity: 'warning', message: m.message + (m.tip ? `\n${m.tip.replace(/<[^>]+>/g, '')}` : ''), source: 'PHPStan', code: m.identifier })
  }
  return res
}

/** psalm --output-format=json */
function parsePsalm(text) {
  let d
  try {
    d = JSON.parse(text.slice(text.indexOf('[')))
  } catch {
    return []
  }
  if (!Array.isArray(d)) return []
  return d.map((x) => ({ file: x.file_path, line: x.line_from || 1, column: x.column_from, severity: x.severity === 'error' ? 'error' : 'info', message: x.message, source: 'Psalm', code: x.type }))
}

/** semgrep --json */
function parseSemgrep(text, root) {
  let d
  try {
    d = JSON.parse(text)
  } catch {
    return []
  }
  return ((d && d.results) || []).map((r) => ({
    file: path.isAbsolute(r.path) ? r.path : path.join(root || '', r.path),
    line: (r.start && r.start.line) || 1,
    column: r.start && r.start.col,
    severity: /ERROR/i.test(r.extra && r.extra.severity) ? 'error' : /WARNING/i.test(r.extra && r.extra.severity) ? 'warning' : 'info',
    message: String((r.extra && r.extra.message) || r.check_id).split('\n')[0],
    source: 'Semgrep',
    code: String(r.check_id || '').split('.').pop()
  }))
}

/**
 * The AI's findings: a JSON array, in a ```json block or on its own. Each item has file, line,
 * severity (critical, high, medium, low, info), title, and optionally why and fix.
 */
function parseAiFindings(text, root) {
  const blocks = [...String(text).matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1])
  const a = String(text).indexOf('[')
  const b = String(text).lastIndexOf(']')
  if (a >= 0 && b > a) blocks.push(String(text).slice(a, b + 1))
  for (const block of blocks) {
    let d
    try {
      d = JSON.parse(block)
    } catch {
      continue
    }
    if (!Array.isArray(d)) continue
    return d
      .filter((x) => x && typeof x === 'object' && (x.title || x.message))
      .map((x) => {
        const sev = String(x.severity || 'medium').toLowerCase()
        const file = typeof x.file === 'string' && x.file ? (path.isAbsolute(x.file) ? x.file : path.join(root || '', x.file)) : null
        return {
          file,
          line: Math.max(1, Number(x.line) || 1),
          severity: sev === 'critical' || sev === 'high' ? 'error' : sev === 'medium' ? 'warning' : 'info',
          message: [String(x.title || x.message), x.why ? String(x.why) : '', x.fix ? `Fix: ${x.fix}` : ''].filter(Boolean).join('\n'),
          source: 'Laramac AI',
          code: sev
        }
      })
  }
  return []
}

/** What the AI is asked. It reads with its tools; it never edits. */
function aiPrompt(target, isFile) {
  return [
    `Review ${isFile ? `the file ${target}` : 'this project'} as a senior developer: real bugs, security problems, and departures from the framework's own best practices (Laravel, Symfony, WordPress, React, Vue, Next.js or whatever this is).`,
    'Use the skills you have that fit (for Laravel, laravel-best-practices; for security, the review skills). Read related files when you need to, but do not change anything.',
    'Only report problems you are confident about, with the exact file and line. Skip style nits.',
    'Answer with a JSON array in a ```json block, nothing else after it. Each item: {"file": "relative/path", "line": 12, "severity": "critical|high|medium|low|info", "title": "short", "why": "one or two sentences", "fix": "what to change"}. An empty array when there is nothing worth reporting.'
  ].join('\n\n')
}

/** The phpstan to use: the project's own, or the one Laramac installed globally. */
function findTool(root, name, globalDirs) {
  const local = path.join(root, 'vendor', 'bin', name)
  if (fs.existsSync(local)) return local
  for (const d of globalDirs) if (fs.existsSync(path.join(d, name))) return path.join(d, name)
  return null
}

// ---------------------------------------------------------------- The extension

function activate(context) {
  const vscode = require('vscode')
  const diags = vscode.languages.createDiagnosticCollection('laramac')
  const aiDiags = vscode.languages.createDiagnosticCollection('laramac-ai')
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50)
  status.command = 'laramac.menu'
  context.subscriptions.push(diags, aiDiags, status)
  const out = vscode.window.createOutputChannel('Laramac')
  context.subscriptions.push(out)

  const home = os.homedir()
  const globalDirs = [path.join(home, '.laramac', 'composer', 'vendor', 'bin'), process.env.LARAMAC_COMPOSER_BIN || ''].filter(Boolean)
  const semgrep = path.join(home, 'MacSec', 'tools', 'bin', 'semgrep')
  const cfg = () => vscode.workspace.getConfiguration('laramac')
  const rootOf = (uri) => {
    const f = uri ? vscode.workspace.getWorkspaceFolder(uri) : (vscode.workspace.workspaceFolders || [])[0]
    return f ? f.uri.fsPath : null
  }
  const SEV = { error: vscode.DiagnosticSeverity.Error, warning: vscode.DiagnosticSeverity.Warning, info: vscode.DiagnosticSeverity.Information }

  const run = (bin, args, cwd, ms) =>
    new Promise((resolve) => {
      execFile(bin, args, { cwd, timeout: ms, maxBuffer: 64 * 1024 * 1024, env: process.env }, (_e, stdout, stderr) => resolve(String(stdout) + (stdout ? '' : String(stderr))))
    })

  function show(collection, items, onlyFiles) {
    const byFile = new Map()
    for (const i of items) {
      if (!i.file) continue
      const list = byFile.get(i.file) || []
      const line = Math.max(0, (i.line || 1) - 1)
      const d = new vscode.Diagnostic(new vscode.Range(line, Math.max(0, (i.column || 1) - 1), line, 999), i.message, SEV[i.severity] || SEV.warning)
      d.source = i.source
      if (i.code) d.code = i.code
      list.push(d)
      byFile.set(i.file, list)
    }
    if (onlyFiles) for (const f of onlyFiles) collection.set(vscode.Uri.file(f), byFile.get(f) || [])
    else {
      collection.clear()
      for (const [f, list] of byFile) collection.set(vscode.Uri.file(f), list)
    }
    refreshStatus()
  }

  function refreshStatus() {
    let n = 0
    diags.forEach((_u, list) => (n += list.length))
    aiDiags.forEach((_u, list) => (n += list.length))
    status.text = n ? `$(shield) Laramac: ${n}` : '$(shield) Laramac'
    status.tooltip = n ? `${n} problems from Laramac's checks. Click for more.` : "Laramac's checks: nothing found. Click for more."
    status.show()
  }

  async function checkFile(doc) {
    const file = doc.uri.fsPath
    const root = rootOf(doc.uri) || path.dirname(file)
    const items = []
    if (doc.languageId === 'php' || file.endsWith('.php')) {
      items.push(...parsePhpLint(await run('php', ['-l', '-d', 'display_errors=stderr', file], root, 20000), file))
      if (!items.length && cfg().get('phpstan', true)) {
        const phpstan = findTool(root, 'phpstan', globalDirs)
        if (phpstan) {
          const hasConfig = ['phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon'].some((c) => fs.existsSync(path.join(root, c)))
          const args = ['analyse', '--error-format=json', '--no-progress', '--memory-limit=1G', ...(hasConfig ? [] : ['--level', String(cfg().get('phpstanLevel', 5))]), file]
          items.push(...parsePhpstan(await run(phpstan, args, root, 120000)))
        }
      }
      if (fs.existsSync(path.join(root, 'psalm.xml')) || fs.existsSync(path.join(root, 'psalm.xml.dist'))) {
        const psalm = findTool(root, 'psalm', globalDirs)
        if (psalm) items.push(...parsePsalm(await run(psalm, ['--output-format=json', '--no-progress', file], root, 120000)))
      }
    }
    show(diags, items.map((i) => ({ ...i, file: i.file && path.isAbsolute(i.file) ? i.file : path.join(root, i.file || file) })), [file])
  }

  async function checkProject() {
    const root = rootOf()
    if (!root) return vscode.window.showInformationMessage('Open a folder first.')
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Laramac is checking the project', cancellable: false }, async (p) => {
      const items = []
      const phpstan = findTool(root, 'phpstan', globalDirs)
      if (phpstan && fs.existsSync(path.join(root, 'composer.json'))) {
        p.report({ message: 'PHPStan' })
        const hasConfig = ['phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon'].some((c) => fs.existsSync(path.join(root, c)))
        const dirs = hasConfig ? [] : ['app', 'src', 'lib'].filter((d) => fs.existsSync(path.join(root, d)))
        if (hasConfig || dirs.length) items.push(...parsePhpstan(await run(phpstan, ['analyse', '--error-format=json', '--no-progress', '--memory-limit=2G', ...(hasConfig ? [] : ['--level', String(cfg().get('phpstanLevel', 5)), ...dirs])], root, 600000)))
      }
      if (fs.existsSync(semgrep)) {
        p.report({ message: 'Semgrep (from MacSec)' })
        items.push(...parseSemgrep(await run(semgrep, ['scan', '--config', 'p/default', '--json', '--quiet', '--metrics', 'off', '.'], root, 900000), root))
      }
      show(diags, items.map((i) => ({ ...i, file: path.isAbsolute(i.file) ? i.file : path.join(root, i.file) })))
      vscode.window.showInformationMessage(items.length ? `Laramac found ${items.length} problems. They are in the Problems panel.` : 'Laramac found nothing to fix.')
    })
  }

  const AI = { claude: 'Claude Code', claudelm: 'Claude Code on your local model', claudefree: 'Claude Code on Free LLM API' }
  async function aiReview(scope) {
    let provider = cfg().get('ai', 'ask')
    if (!AI[provider]) {
      const pick = await vscode.window.showQuickPick(
        Object.entries(AI).map(([id, label]) => ({ id, label, description: id === 'claude' ? 'Your Claude account' : id === 'claudelm' ? 'LM Studio or Ollama, nothing leaves this Mac' : 'Your free keys' })),
        { placeHolder: 'Who reviews the code? (Change the default in Settings: Laramac)' }
      )
      if (!pick) return
      provider = pick.id
    }
    const editor = vscode.window.activeTextEditor
    const root = rootOf(editor && editor.document.uri)
    if (!root) return vscode.window.showInformationMessage('Open a folder first.')
    const isFile = scope === 'file' && editor
    const target = isFile ? path.relative(root, editor.document.uri.fsPath) : '.'
    const pluginDirs = String(process.env.LARAMAC_SKILL_DIRS || '').split(path.delimiter).filter((d) => d && fs.existsSync(d))
    const args = ['-p', aiPrompt(target, !!isFile), '--output-format', 'text', '--permission-mode', 'plan', '--allowedTools', 'Read,Grep,Glob,Skill', '--no-session-persistence', ...pluginDirs.flatMap((d) => ['--plugin-dir', d])]
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `${AI[provider]} is reviewing ${isFile ? path.basename(target) : 'the project'}`, cancellable: true }, (p, token) =>
      new Promise((resolve) => {
        const started = Date.now()
        const child = spawn(provider, args, { cwd: root, env: process.env })
        let text = ''
        let err = ''
        child.stdout.on('data', (b) => (text += b))
        child.stderr.on('data', (b) => (err += b))
        const tick = setInterval(() => p.report({ message: `${Math.round((Date.now() - started) / 60000)} min` }), 30000)
        token.onCancellationRequested(() => child.kill())
        child.on('error', () => {
          clearInterval(tick)
          vscode.window.showErrorMessage(`${AI[provider]} is not set up yet. Set it up in Laramac, AI tools.`)
          resolve()
        })
        child.on('close', (code) => {
          clearInterval(tick)
          out.appendLine(`--- ${AI[provider]}, ${new Date().toLocaleString()}\n${text}`)
          const found = parseAiFindings(text, root)
          if (code !== 0 && !found.length) {
            if (!token.isCancellationRequested) vscode.window.showErrorMessage(`The review stopped: ${(err || text).trim().split('\n').pop() || 'no answer'}`)
            return resolve()
          }
          show(aiDiags, found, isFile ? [path.join(root, target)] : undefined)
          vscode.window.showInformationMessage(found.length ? `${found.length} things to look at, in the Problems panel.` : 'Nothing worth reporting.', 'Show the full answer').then((c) => c && out.show())
          resolve()
        })
      })
    )
  }

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (cfg().get('checkOnSave', true)) void checkFile(doc)
    }),
    vscode.commands.registerCommand('laramac.checkFile', () => vscode.window.activeTextEditor && checkFile(vscode.window.activeTextEditor.document)),
    vscode.commands.registerCommand('laramac.checkProject', () => checkProject()),
    vscode.commands.registerCommand('laramac.reviewFile', () => aiReview('file')),
    vscode.commands.registerCommand('laramac.reviewProject', () => aiReview('project')),
    vscode.commands.registerCommand('laramac.clear', () => {
      diags.clear()
      aiDiags.clear()
      refreshStatus()
    }),
    vscode.commands.registerCommand('laramac.menu', async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: '$(check) Check this file', id: 'laramac.checkFile' },
          { label: '$(checklist) Check the project', description: 'PHPStan, and Semgrep when MacSec is installed', id: 'laramac.checkProject' },
          { label: '$(sparkle) Review this file with AI', id: 'laramac.reviewFile' },
          { label: '$(sparkle) Review the project with AI', id: 'laramac.reviewProject' },
          { label: '$(clear-all) Clear Laramac’s problems', id: 'laramac.clear' }
        ],
        { placeHolder: 'Laramac' }
      )
      if (pick) vscode.commands.executeCommand(pick.id)
    })
  )
  refreshStatus()

  // The first time: Claude Code opens in the side panel on the right, so the AI chat is there
  // straight away. After that the editor remembers where you put it.
  const claude = vscode.extensions.getExtension('anthropic.claude-code')
  if (claude && !context.globalState.get('laramac.sidePanel')) {
    void context.globalState.update('laramac.sidePanel', true)
    setTimeout(() => {
      vscode.commands.executeCommand('claude-vscode.sidebar.open').then(undefined, () => undefined)
    }, 1500)
  }
}

function deactivate() {}

module.exports = { activate, deactivate, parsePhpLint, parsePhpstan, parsePsalm, parseSemgrep, parseAiFindings, aiPrompt, findTool }

/**
 * The Dumps window: dump() and dd() from Laravel, Symfony and any project using Symfony's
 * VarDumper are sent to a dump server here instead of the page (VAR_DUMPER_FORMAT=server).
 * The server is a tiny PHP script using Laramac's own copy of symfony/var-dumper, which turns
 * each dump into HTML. Only this Mac can connect to it.
 */
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { EventEmitter } from 'events'
import { join } from 'path'
import type { DumpItem } from '../shared/types'
import { dirs } from './paths'
import { runQuiet } from './starterrun'
import { runtimeEnv } from './runtimes'
import { defaultMinor, phpBinary, phpIniPath } from './php'
import { composerPhar, installComposer } from './tools'
import { findOnPath } from './platform'

export const DUMP_PORT = 9912
export const dumperDir = (): string => join(dirs.root(), 'dumper')
export const dumpEvents = new EventEmitter()

const SERVER_PHP = `<?php
// Written by Laramac. Receives dumps and prints each one as a line of JSON.
require __DIR__ . '/vendor/autoload.php';

use Symfony\\Component\\VarDumper\\Cloner\\Data;
use Symfony\\Component\\VarDumper\\Dumper\\HtmlDumper;
use Symfony\\Component\\VarDumper\\Dumper\\CliDumper;
use Symfony\\Component\\VarDumper\\Server\\DumpServer;

$server = new DumpServer($argv[1] ?? 'tcp://127.0.0.1:${DUMP_PORT}');
$server->start();
fwrite(STDOUT, json_encode(['ready' => true]) . "\\n");

$html = new HtmlDumper();
$html->setDumpHeader('');
$text = new CliDumper();
$text->setColors(false);

$server->listen(function (Data $data, array $context, int $clientId) use ($html, $text) {
    $source = $context['source'] ?? [];
    $request = $context['request'] ?? [];
    $cli = $context['cli'] ?? [];
    $out = [
        'html' => $html->dump($data, true),
        'text' => mb_substr($text->dump($data, true), 0, 20000),
        'file' => $source['file'] ?? null,
        'line' => $source['line'] ?? null,
        'name' => $source['name'] ?? null,
        'uri' => is_string($request['uri'] ?? null) ? $request['uri'] : null,
        'method' => is_string($request['method'] ?? null) ? $request['method'] : null,
        'command' => is_string($cli['command_line'] ?? null) ? $cli['command_line'] : null,
        'at' => (int) (($context['timestamp'] ?? microtime(true)) * 1000),
    ];
    fwrite(STDOUT, json_encode($out, JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES) . "\\n");
});
`

export const dumperInstalled = (): boolean => existsSync(join(dumperDir(), 'vendor', 'symfony', 'var-dumper'))

/** The PHP and Composer to use: Laramac's own, or the ones on this Mac. */
function phpCommand(): { php: string[]; composer: string[] } | null {
  const minor = defaultMinor()
  if (minor) return { php: [phpBinary(minor), '-c', phpIniPath(minor)], composer: [phpBinary(minor), '-c', phpIniPath(minor), composerPhar()] }
  const php = findOnPath('php')
  const composer = findOnPath('composer')
  return php && composer ? { php: [php], composer: [composer] } : null
}

export async function installDumper(onLine: (l: string) => void = () => undefined): Promise<void> {
  if (defaultMinor() && !existsSync(composerPhar())) await installComposer()
  const cmd = phpCommand()
  if (!cmd) throw new Error('Install PHP on the PHP page first.')
  mkdirSync(dumperDir(), { recursive: true })
  writeFileSync(join(dumperDir(), 'composer.json'), JSON.stringify({ require: { 'symfony/var-dumper': '*' }, config: { 'optimize-autoloader': true } }, null, 2))
  await runQuiet([...cmd.composer, 'update', '--no-interaction', '--no-progress', '--prefer-dist'], dumperDir(), runtimeEnv(), onLine)
  writeFileSync(join(dumperDir(), 'server.php'), SERVER_PHP)
}

let child: ChildProcess | null = null
const recent: DumpItem[] = []
let counter = 0

export const listDumps = (): DumpItem[] => [...recent]
export function clearDumps(): void {
  recent.length = 0
  dumpEvents.emit('changed', listDumps())
}
export const dumpServerRunning = (): boolean => !!child && child.exitCode === null

/** Turns one line from the dump server into an item, or null if it is not a dump. */
export function parseDumpLine(line: string): DumpItem | null {
  try {
    const j = JSON.parse(line) as Partial<DumpItem> & { ready?: boolean; html?: string }
    if (j.ready || typeof j.html !== 'string') return null
    return {
      id: `d${++counter}`,
      html: j.html,
      text: typeof j.text === 'string' ? j.text : '',
      file: j.file ?? null,
      line: typeof j.line === 'number' ? j.line : null,
      name: j.name ?? null,
      uri: j.uri ?? null,
      method: j.method ?? null,
      command: j.command ?? null,
      at: typeof j.at === 'number' ? j.at : Date.now()
    }
  } catch {
    return null
  }
}

export async function startDumpServer(port = DUMP_PORT): Promise<void> {
  if (dumpServerRunning()) return
  if (!dumperInstalled()) await installDumper()
  if (!existsSync(join(dumperDir(), 'server.php'))) writeFileSync(join(dumperDir(), 'server.php'), SERVER_PHP)
  const cmd = phpCommand()
  if (!cmd) throw new Error('Install PHP on the PHP page first.')
  const [bin, ...args] = cmd.php
  const proc = spawn(bin, [...args, join(dumperDir(), 'server.php'), `tcp://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] })
  child = proc
  let buf = ''
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The dump server did not start.')), 15000)
    proc.stdout.on('data', (d) => {
      buf += d.toString()
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        if (line.includes('"ready"')) {
          clearTimeout(timer)
          resolve()
          continue
        }
        const item = parseDumpLine(line)
        if (!item) continue
        recent.unshift(item)
        if (recent.length > 300) recent.length = 300
        dumpEvents.emit('dump', item)
        dumpEvents.emit('changed', listDumps())
      }
    })
    let err = ''
    proc.stderr.on('data', (d) => (err += d.toString()))
    proc.on('exit', () => {
      clearTimeout(timer)
      if (child === proc) child = null
      reject(new Error(`The dump server stopped. ${err.trim().split('\n').pop() ?? ''}`.trim()))
    })
  })
}

export function stopDumpServer(): void {
  child?.kill()
  child = null
}

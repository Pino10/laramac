/**
 * The starter catalog. Each starter runs a framework's own official setup tool, so new
 * projects always get the latest release. Pure data and functions, shared by both processes.
 */
import type { RuntimeId } from './types'

export type StarterCategory = 'frontend' | 'fullstack' | 'backend' | 'php' | 'dotnet' | 'python' | 'systems' | 'mobile' | 'desktop' | 'apple'

export const CATEGORIES: { id: StarterCategory; label: string }[] = [
  { id: 'fullstack', label: 'Full-stack' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'php', label: 'PHP' },
  { id: 'backend', label: 'APIs' },
  { id: 'python', label: 'Python' },
  { id: 'dotnet', label: 'C# and .NET' },
  { id: 'systems', label: 'Go and Rust' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'apple', label: 'Swift' }
]

export interface StarterContext {
  /** Folder name, as typed. */
  name: string
  /** name.test */
  domain: string
  /** Database name, letters, numbers and underscores. */
  db: string
  tld: string
  /** A safe identifier made from the name, for code (Swift types, Go modules). */
  ident: string
  /** MySQL's root password, when you set one. */
  dbPassword?: string
}

export type StarterStep =
  | { label: string; run: string[]; cwd?: 'parent' | 'project'; env?: Record<string, string> }
  | { label: string; write: string; content: string }
  | { label: string; patch: string; replace?: [RegExp, string][]; append?: string }
  | { label: string; mkdir: true }
  | { label: string; database: 'mysql' | 'postgres' }
  | { label: string; laravelEnv: string }

export interface StarterOption {
  id: string
  label: string
  choices: { id: string; label: string }[]
  default: string
}

export interface DevSpec {
  /** {port} is replaced with the port Laramac picks. */
  command: string[]
  /** true: name.test is passed through to this server. false: the web server serves PHP and this runs beside it. */
  proxy: boolean
  env?: Record<string, string>
}

export interface Starter {
  id: string
  name: string
  category: StarterCategory
  description: string
  /** Two letters and a colour for the tile. */
  mark: string
  color: string
  runtimes: RuntimeId[]
  /** Where to look up the newest version of the setup tool. */
  source?: { npm?: string; packagist?: string; pypi?: string; crates?: string; github?: string }
  docs: string
  options?: StarterOption[]
  /** Shown before creating, such as "Needs Xcode". */
  note?: string
  steps: (c: StarterContext, o: Record<string, string>) => StarterStep[]
  dev?: (o: Record<string, string>) => DevSpec | null
}

const npx = (pkg: string, ...args: string[]): string[] => ['npx', '--yes', pkg, ...args]
const npmInstall: StarterStep = { label: 'Installing packages', run: ['npm', 'install', '--no-fund', '--no-audit'], cwd: 'project' }
const viteDev: DevSpec = { command: ['npm', 'run', 'dev', '--', '--port', '{port}', '--strictPort', '--host', '127.0.0.1'], proxy: true }
const lang = (d = 'ts'): StarterOption => ({
  id: 'lang',
  label: 'Language',
  choices: [
    { id: 'ts', label: 'TypeScript' },
    { id: 'js', label: 'JavaScript' }
  ],
  default: d
})

const DB_OPTION: StarterOption = {
  id: 'db',
  label: 'Database',
  choices: [
    { id: 'mysql', label: 'MySQL' },
    { id: 'sqlite', label: 'SQLite' },
    { id: 'pgsql', label: 'PostgreSQL' }
  ],
  default: 'mysql'
}

/** Points a Laravel .env at the chosen local database. */
export function laravelEnv(env: string, db: string, dbName: string, domain: string, password = ''): string {
  const set = (s: string, key: string, value: string | null): string => {
    const re = new RegExp(`^#?\\s*${key}=.*$`, 'm')
    if (value === null) return s.replace(re, `# ${key}=`)
    return re.test(s) ? s.replace(re, `${key}=${value}`) : `${s.trimEnd()}\n${key}=${value}\n`
  }
  let out = set(env, 'APP_URL', `http://${domain}`)
  out = set(out, 'DB_CONNECTION', db)
  if (db === 'sqlite') {
    for (const k of ['DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD']) out = set(out, k, null)
  } else {
    out = set(out, 'DB_HOST', '127.0.0.1')
    out = set(out, 'DB_PORT', db === 'pgsql' ? '5432' : '3306')
    out = set(out, 'DB_DATABASE', dbName)
    out = set(out, 'DB_USERNAME', db === 'pgsql' ? 'postgres' : 'root')
    out = set(out, 'DB_PASSWORD', db === 'pgsql' ? '' : password)
  }
  out = set(out, 'MAIL_MAILER', 'smtp')
  out = set(out, 'MAIL_HOST', '127.0.0.1')
  out = set(out, 'MAIL_PORT', '1025')
  return out
}

const composerCreate = (pkg: string, name: string): StarterStep => ({
  label: `Downloading ${pkg}`,
  run: ['composer', 'create-project', pkg, name, '--prefer-dist', '--no-interaction'],
  cwd: 'parent'
})

const GO_MAIN = (name: string): string => `package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "<h1>${name} is running on Go</h1>")
	})
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, \`{"ok":true}\`)
	})

	log.Printf("Listening on http://127.0.0.1:%s", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, mux))
}
`

const GIN_MAIN = (name: string): string => `package main

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r := gin.Default()
	r.GET("/", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html", []byte("<h1>${name} is running on Gin</h1>"))
	})
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	r.Run("127.0.0.1:" + port)
}
`

const AXUM_MAIN = (name: string): string => `use axum::{response::Html, routing::get, Json, Router};
use serde_json::{json, Value};

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
    let app = Router::new()
        .route("/", get(|| async { Html("<h1>${name} is running on Rust</h1>") }))
        .route("/api/health", get(health));

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}")).await.unwrap();
    println!("Listening on http://127.0.0.1:{port}");
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}
`

const FASTAPI_MAIN = (name: string): string => `from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="${name}")


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    return "<h1>${name} is running on FastAPI</h1><p>API docs are at <a href='/docs'>/docs</a>.</p>"


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}
`

const FLASK_APP = (name: string): string => `from flask import Flask, jsonify

app = Flask(__name__)


@app.get("/")
def home():
    return "<h1>${name} is running on Flask</h1>"


@app.get("/api/health")
def health():
    return jsonify(ok=True)
`

const STREAMLIT_APP = (name: string): string => `import numpy as np
import pandas as pd
import streamlit as st

st.set_page_config(page_title="${name}", layout="wide")
st.title("${name}")
st.write("Edit app.py and save. The page reloads by itself.")

points = st.slider("Points", 10, 500, 100)
data = pd.DataFrame(np.random.randn(points, 3).cumsum(axis=0), columns=["a", "b", "c"])
st.line_chart(data)
st.dataframe(data.tail(10), use_container_width=True)
`

const SWIFTUI_APP = `import SwiftUI

@main
struct MainApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
`

const SWIFTUI_VIEW = (name: string): string => `import SwiftUI

struct ContentView: View {
    @State private var taps = 0

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles")
                .font(.system(size: 48))
                .foregroundStyle(.purple)
            Text("${name}")
                .font(.largeTitle.bold())
            Button("Tapped \\(taps) times") { taps += 1 }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
        }
        .padding(40)
    }
}

#Preview {
    ContentView()
}
`

/** An XcodeGen spec for a SwiftUI app. */
export const xcodeProjectSpec = (c: StarterContext, platform: 'iOS' | 'macOS'): string => `name: ${c.ident}
options:
  bundleIdPrefix: com.example
  createIntermediateGroups: true
targets:
  ${c.ident}:
    type: application
    platform: ${platform}
    deploymentTarget: "${platform === 'iOS' ? '17.0' : '14.0'}"
    sources: [Sources]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.example.${c.ident.toLowerCase()}
        PRODUCT_NAME: ${c.ident}
        GENERATE_INFOPLIST_FILE: YES
        MARKETING_VERSION: "1.0"
        CURRENT_PROJECT_VERSION: "1"
        SWIFT_VERSION: "5.0"${platform === 'iOS' ? '\n        INFOPLIST_KEY_UILaunchScreen_Generation: YES\n        TARGETED_DEVICE_FAMILY: "1,2"' : ''}
`

export const STARTERS: Starter[] = [
  // ------------------------------------------------------------- Full-stack
  {
    id: 'nextjs',
    name: 'Next.js',
    category: 'fullstack',
    description: 'React framework with server rendering, routing and API routes. Tailwind and ESLint included.',
    mark: 'N',
    color: '#111111',
    runtimes: ['node'],
    source: { npm: 'create-next-app' },
    docs: 'https://nextjs.org/docs',
    options: [
      lang(),
      {
        id: 'tailwind',
        label: 'Tailwind CSS',
        choices: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' }
        ],
        default: 'yes'
      }
    ],
    steps: (c, o) => [
      {
        label: 'Running create-next-app',
        run: npx(
          'create-next-app@latest',
          c.name,
          o.lang === 'js' ? '--js' : '--ts',
          o.tailwind === 'no' ? '--no-tailwind' : '--tailwind',
          '--eslint',
          '--app',
          '--src-dir',
          '--turbopack',
          '--import-alias',
          '@/*',
          '--use-npm',
          '--disable-git',
          '--yes'
        ),
        cwd: 'parent'
      },
      {
        label: `Allowing ${c.domain} in development`,
        patch: o.lang === 'js' ? 'next.config.mjs' : 'next.config.ts',
        replace: [[/(const nextConfig[^=]*=\s*\{)/, `$1\n  allowedDevOrigins: ['${c.domain}', '*.${c.domain}'],`]]
      }
    ],
    dev: () => ({ command: ['npm', 'run', 'dev', '--', '-p', '{port}', '-H', '127.0.0.1'], proxy: true })
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    category: 'fullstack',
    description: 'The Vue framework for full-stack apps, with file-based routing and server routes.',
    mark: 'Nx',
    color: '#00a26b',
    runtimes: ['node'],
    source: { npm: 'nuxi' },
    docs: 'https://nuxt.com/docs',
    steps: (c) => [
      { label: 'Running nuxi init', run: npx('nuxi@latest', 'init', c.name, '--packageManager', 'npm', '--gitInit', 'false', '--no-install', '--template', 'minimal', '--force'), cwd: 'parent' },
      npmInstall
    ],
    dev: () => ({ command: ['npm', 'run', 'dev', '--', '--port', '{port}', '--host', '127.0.0.1'], proxy: true })
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    category: 'fullstack',
    description: 'Svelte with routing, server rendering and form actions, from the official sv tool.',
    mark: 'Sk',
    color: '#ff3e00',
    runtimes: ['node'],
    source: { npm: 'sv' },
    docs: 'https://svelte.dev/docs/kit',
    options: [
      {
        id: 'template',
        label: 'Template',
        choices: [
          { id: 'minimal', label: 'Minimal' },
          { id: 'demo', label: 'Demo app' }
        ],
        default: 'minimal'
      },
      lang()
    ],
    steps: (c, o) => [
      {
        label: 'Running sv create',
        run: npx('sv@latest', 'create', c.name, '--template', o.template || 'minimal', '--types', o.lang === 'js' ? 'jsdoc' : 'ts', '--no-add-ons', '--no-install'),
        cwd: 'parent'
      },
      npmInstall
    ],
    dev: () => viteDev
  },
  {
    id: 'react-router',
    name: 'React Router',
    category: 'fullstack',
    description: 'Full-stack React with loaders and actions. This is what Remix became.',
    mark: 'RR',
    color: '#e33b3b',
    runtimes: ['node'],
    source: { npm: 'create-react-router' },
    docs: 'https://reactrouter.com/home',
    steps: (c) => [{ label: 'Running create-react-router', run: npx('create-react-router@latest', c.name, '--yes', '--no-git-init', '--no-install'), cwd: 'parent' }, npmInstall],
    dev: () => viteDev
  },
  {
    id: 'astro',
    name: 'Astro',
    category: 'fullstack',
    description: 'Fast content sites and blogs. Use React, Vue or Svelte components where you need them.',
    mark: 'As',
    color: '#bc52ee',
    runtimes: ['node'],
    source: { npm: 'create-astro' },
    docs: 'https://docs.astro.build',
    options: [
      {
        id: 'template',
        label: 'Template',
        choices: [
          { id: 'basics', label: 'Basics' },
          { id: 'blog', label: 'Blog' },
          { id: 'portfolio', label: 'Portfolio' },
          { id: 'starlight', label: 'Docs (Starlight)' },
          { id: 'minimal', label: 'Empty' }
        ],
        default: 'basics'
      }
    ],
    steps: (c, o) => [
      {
        label: 'Running create-astro',
        run: npx('create-astro@latest', c.name, '--template', o.template === 'starlight' ? 'starlight' : o.template || 'basics', '--no-install', '--no-git', '--yes', '--skip-houston'),
        cwd: 'parent'
      },
      npmInstall
    ],
    dev: () => ({ command: ['npm', 'run', 'dev', '--', '--port', '{port}', '--host', '127.0.0.1'], proxy: true })
  },

  // ------------------------------------------------------------- Frontend
  {
    id: 'react',
    name: 'React',
    category: 'frontend',
    description: 'A React single-page app with Vite, the fastest way to start with React.',
    mark: 'Re',
    color: '#149eca',
    runtimes: ['node'],
    source: { npm: 'create-vite' },
    docs: 'https://react.dev/learn',
    options: [
      lang(),
      {
        id: 'compiler',
        label: 'React Compiler',
        choices: [
          { id: 'off', label: 'Off' },
          { id: 'on', label: 'On (automatic memoizing)' }
        ],
        default: 'off'
      }
    ],
    steps: (c, o) => [
      {
        label: 'Running create-vite',
        run: ['npm', 'create', '--yes', 'vite@latest', c.name, '--', '--template', `react${o.compiler === 'on' ? '-compiler' : ''}${o.lang === 'js' ? '' : '-ts'}`, '--no-interactive'],
        cwd: 'parent'
      },
      npmInstall
    ],
    dev: () => viteDev
  },
  {
    id: 'vue',
    name: 'Vue',
    category: 'frontend',
    description: 'A Vue app from create-vue, with Vue Router and Pinia ready to use.',
    mark: 'Vu',
    color: '#42b883',
    runtimes: ['node'],
    source: { npm: 'create-vue' },
    docs: 'https://vuejs.org/guide',
    options: [lang()],
    steps: (c, o) => [
      { label: 'Running create-vue', run: npx('create-vue@latest', c.name, ...(o.lang === 'js' ? [] : ['--typescript']), '--router', '--pinia', '--eslint'), cwd: 'parent' },
      npmInstall
    ],
    dev: () => viteDev
  },
  {
    id: 'angular',
    name: 'Angular',
    category: 'frontend',
    description: "Google's framework for large apps, from the official Angular CLI.",
    mark: 'Ng',
    color: '#dd0031',
    runtimes: ['node'],
    source: { npm: '@angular/cli' },
    docs: 'https://angular.dev',
    steps: (c) => [{ label: 'Running ng new', run: npx('@angular/cli@latest', 'new', c.name, '--defaults', '--skip-git', '--skip-install'), cwd: 'parent' }, npmInstall],
    dev: () => ({ command: ['npm', 'run', 'start', '--', '--port', '{port}', '--host', '127.0.0.1'], proxy: true })
  },
  {
    id: 'vite',
    name: 'Vite',
    category: 'frontend',
    description: 'Solid, Preact, Lit, Svelte, Qwik or plain TypeScript, each with Vite.',
    mark: 'Vi',
    color: '#8e5cf7',
    runtimes: ['node'],
    source: { npm: 'create-vite' },
    docs: 'https://vite.dev/guide',
    options: [
      {
        id: 'framework',
        label: 'Framework',
        choices: [
          { id: 'vanilla', label: 'Plain' },
          { id: 'solid', label: 'Solid' },
          { id: 'preact', label: 'Preact' },
          { id: 'svelte', label: 'Svelte' },
          { id: 'lit', label: 'Lit' },
          { id: 'qwik', label: 'Qwik' }
        ],
        default: 'vanilla'
      },
      lang()
    ],
    steps: (c, o) => [
      {
        label: 'Running create-vite',
        run: ['npm', 'create', '--yes', 'vite@latest', c.name, '--', '--template', `${o.framework || 'vanilla'}${o.lang === 'js' ? '' : '-ts'}`, '--no-interactive'],
        cwd: 'parent'
      },
      npmInstall
    ],
    dev: () => viteDev
  },

  // ------------------------------------------------------------- PHP
  {
    id: 'laravel',
    name: 'Laravel',
    category: 'php',
    description: 'Laravel with an official starter kit: React, Vue, Svelte or Livewire, with login and registration built in.',
    mark: 'La',
    color: '#ff2d20',
    runtimes: ['php', 'node'],
    source: { packagist: 'laravel/laravel' },
    docs: 'https://laravel.com/docs',
    options: [
      {
        id: 'kit',
        label: 'Starter kit',
        choices: [
          { id: 'react', label: 'React' },
          { id: 'vue', label: 'Vue' },
          { id: 'svelte', label: 'Svelte' },
          { id: 'livewire', label: 'Livewire' },
          { id: 'none', label: 'None' }
        ],
        default: 'react'
      },
      DB_OPTION,
      {
        id: 'admin',
        label: 'Admin panel',
        choices: [
          { id: 'none', label: 'None' },
          { id: 'filament', label: 'Filament' }
        ],
        default: 'none'
      }
    ],
    steps: (c, o) => {
      const kit = o.kit || 'react'
      const db = o.db || 'mysql'
      const steps: StarterStep[] = [composerCreate(kit === 'none' ? 'laravel/laravel' : `laravel/${kit}-starter-kit`, c.name)]
      if (db !== 'sqlite') steps.push({ label: 'Creating the database', database: db === 'pgsql' ? 'postgres' : 'mysql' })
      steps.push({ label: 'Pointing .env at your database', laravelEnv: db })
      steps.push({ label: 'Running migrations', run: ['php', 'artisan', 'migrate', '--force', '--no-interaction'], cwd: 'project' })
      if (o.admin === 'filament') {
        steps.push({ label: 'Adding Filament', run: ['composer', 'require', 'filament/filament', '-W', '--no-interaction'], cwd: 'project' })
        steps.push({ label: 'Setting up the admin panel', run: ['php', 'artisan', 'filament:install', '--panels', '--no-interaction'], cwd: 'project' })
      }
      if (kit !== 'none') steps.push(npmInstall, { label: 'Building assets', run: ['npm', 'run', 'build'], cwd: 'project' })
      return steps
    },
    dev: (o) => (o.kit === 'none' ? null : { command: ['npm', 'run', 'dev'], proxy: false })
  },
  {
    id: 'symfony',
    name: 'Symfony',
    category: 'php',
    description: 'The Symfony skeleton, or the full web app pack with Twig, Doctrine and forms.',
    mark: 'Sy',
    color: '#1a171b',
    runtimes: ['php'],
    source: { packagist: 'symfony/skeleton' },
    docs: 'https://symfony.com/doc/current/index.html',
    options: [
      {
        id: 'type',
        label: 'Type',
        choices: [
          { id: 'webapp', label: 'Web app' },
          { id: 'api', label: 'API or microservice' }
        ],
        default: 'webapp'
      }
    ],
    steps: (c, o) => [
      composerCreate('symfony/skeleton', c.name),
      ...(o.type === 'api' ? [] : [{ label: 'Adding the web app pack', run: ['composer', 'require', 'webapp', '--no-interaction'], cwd: 'project' as const }]),
      { label: 'Pointing .env at MySQL', patch: '.env', append: `\nDATABASE_URL="mysql://root:${encodeURIComponent(c.dbPassword ?? '')}@127.0.0.1:3306/${c.db}?serverVersion=8.4&charset=utf8mb4"\n` },
      { label: 'Creating the database', database: 'mysql' }
    ]
  },
  {
    id: 'statamic',
    name: 'Statamic',
    category: 'php',
    description: 'A flat-file CMS built on Laravel, with a polished control panel.',
    mark: 'St',
    color: '#ff269e',
    runtimes: ['php'],
    source: { packagist: 'statamic/statamic' },
    docs: 'https://statamic.dev',
    steps: (c) => [composerCreate('statamic/statamic', c.name)]
  },
  {
    id: 'drupal',
    name: 'Drupal',
    category: 'php',
    description: 'The recommended Drupal project, ready for its web installer.',
    mark: 'Dr',
    color: '#0678be',
    runtimes: ['php'],
    source: { packagist: 'drupal/recommended-project' },
    docs: 'https://www.drupal.org/docs',
    steps: (c) => [composerCreate('drupal/recommended-project', c.name), { label: 'Creating the database', database: 'mysql' }]
  },
  {
    id: 'craft',
    name: 'Craft CMS',
    category: 'php',
    description: 'A flexible CMS for content-heavy sites.',
    mark: 'Cr',
    color: '#e5422b',
    runtimes: ['php'],
    source: { packagist: 'craftcms/craft' },
    docs: 'https://craftcms.com/docs',
    steps: (c) => [composerCreate('craftcms/craft', c.name), { label: 'Creating the database', database: 'mysql' }]
  },
  {
    id: 'slim',
    name: 'Slim',
    category: 'php',
    description: 'A small PHP framework for APIs, from the official Slim skeleton.',
    mark: 'Sl',
    color: '#74a045',
    runtimes: ['php'],
    source: { packagist: 'slim/slim-skeleton' },
    docs: 'https://www.slimframework.com/docs/v4',
    steps: (c) => [composerCreate('slim/slim-skeleton', c.name)]
  },
  {
    id: 'codeigniter',
    name: 'CodeIgniter',
    category: 'php',
    description: 'A light, fast PHP framework, from the official app starter.',
    mark: 'CI',
    color: '#dd4814',
    runtimes: ['php'],
    source: { packagist: 'codeigniter4/appstarter' },
    docs: 'https://codeigniter.com/user_guide',
    steps: (c) => [composerCreate('codeigniter4/appstarter', c.name)]
  },

  // ------------------------------------------------------------- JavaScript APIs
  {
    id: 'nestjs',
    name: 'NestJS',
    category: 'backend',
    description: 'Structured TypeScript APIs with modules, dependency injection and testing set up.',
    mark: 'Ne',
    color: '#e0234e',
    runtimes: ['node'],
    source: { npm: '@nestjs/cli' },
    docs: 'https://docs.nestjs.com',
    steps: (c) => [{ label: 'Running nest new', run: npx('@nestjs/cli@latest', 'new', c.name, '--package-manager', 'npm', '--skip-git', '--skip-install'), cwd: 'parent' }, npmInstall],
    dev: () => ({ command: ['npm', 'run', 'start:dev'], proxy: true, env: { PORT: '{port}' } })
  },
  {
    id: 'hono',
    name: 'Hono',
    category: 'backend',
    description: 'A tiny, very fast web framework for Node, Bun and the edge.',
    mark: 'Ho',
    color: '#ff5b11',
    runtimes: ['node'],
    source: { npm: 'create-hono' },
    docs: 'https://hono.dev/docs',
    steps: (c) => [
      { label: 'Running create-hono', run: npx('create-hono@latest', c.name, '--template', 'nodejs', '--pm', 'npm', '--install'), cwd: 'parent' },
      { label: 'Reading the port from PORT', patch: 'src/index.ts', replace: [[/port:\s*3000/, 'port: Number(process.env.PORT) || 3000']] }
    ],
    dev: () => ({ command: ['npm', 'run', 'dev'], proxy: true, env: { PORT: '{port}' } })
  },
  {
    id: 'elysia',
    name: 'Elysia on Bun',
    category: 'backend',
    description: 'An ergonomic TypeScript framework that runs on Bun, the fast JavaScript runtime.',
    mark: 'El',
    color: '#9b59f5',
    runtimes: ['bun'],
    source: { npm: 'elysia' },
    docs: 'https://elysiajs.com',
    steps: (c) => [
      { label: 'Running bun create elysia', run: ['bun', 'create', 'elysia', c.name], cwd: 'parent' },
      { label: 'Reading the port from PORT', patch: 'src/index.ts', replace: [[/\.listen\(3000\)/, '.listen(Number(process.env.PORT) || 3000)']] }
    ],
    dev: () => ({ command: ['bun', 'run', 'dev'], proxy: true, env: { PORT: '{port}' } })
  },

  // ------------------------------------------------------------- Python
  {
    id: 'fastapi',
    name: 'FastAPI',
    category: 'python',
    description: 'Python APIs with automatic docs at /docs. Uses uv for Python and packages.',
    mark: 'Fa',
    color: '#009485',
    runtimes: ['python'],
    source: { pypi: 'fastapi' },
    docs: 'https://fastapi.tiangolo.com',
    steps: (c) => [
      { label: 'Creating the Python project', run: ['uv', 'init', c.name, '--app', '--no-workspace', '--vcs', 'none'], cwd: 'parent' },
      { label: 'Adding FastAPI', run: ['uv', 'add', 'fastapi[standard]'], cwd: 'project' },
      { label: 'Writing main.py', write: 'main.py', content: FASTAPI_MAIN(c.name) }
    ],
    dev: () => ({ command: ['uv', 'run', 'fastapi', 'dev', 'main.py', '--port', '{port}', '--host', '127.0.0.1'], proxy: true })
  },
  {
    id: 'django',
    name: 'Django',
    category: 'python',
    description: 'The batteries-included Python web framework, with the admin site ready.',
    mark: 'Dj',
    color: '#0c4b33',
    runtimes: ['python'],
    source: { pypi: 'django' },
    docs: 'https://docs.djangoproject.com',
    steps: (c) => [
      { label: 'Creating the Python project', run: ['uv', 'init', c.name, '--app', '--no-workspace', '--vcs', 'none'], cwd: 'parent' },
      { label: 'Adding Django', run: ['uv', 'add', 'django'], cwd: 'project' },
      { label: 'Running startproject', run: ['uv', 'run', 'django-admin', 'startproject', 'config', '.'], cwd: 'project' },
      {
        label: `Allowing ${c.domain}`,
        patch: 'config/settings.py',
        append: `\n# Added by Laramac for local development.\nALLOWED_HOSTS = ["127.0.0.1", "localhost", "${c.domain}", ".${c.domain}"]\nCSRF_TRUSTED_ORIGINS = ["http://${c.domain}", "https://${c.domain}"]\n`
      },
      { label: 'Creating the database tables', run: ['uv', 'run', 'python', 'manage.py', 'migrate'], cwd: 'project' }
    ],
    dev: () => ({ command: ['uv', 'run', 'python', 'manage.py', 'runserver', '127.0.0.1:{port}'], proxy: true })
  },
  {
    id: 'flask',
    name: 'Flask',
    category: 'python',
    description: 'A small Python web framework, easy to grow.',
    mark: 'Fl',
    color: '#3b9fb5',
    runtimes: ['python'],
    source: { pypi: 'flask' },
    docs: 'https://flask.palletsprojects.com',
    steps: (c) => [
      { label: 'Creating the Python project', run: ['uv', 'init', c.name, '--app', '--no-workspace', '--vcs', 'none'], cwd: 'parent' },
      { label: 'Adding Flask', run: ['uv', 'add', 'flask'], cwd: 'project' },
      { label: 'Writing app.py', write: 'app.py', content: FLASK_APP(c.name) }
    ],
    dev: () => ({ command: ['uv', 'run', 'flask', '--app', 'app', 'run', '--debug', '--port', '{port}', '--host', '127.0.0.1'], proxy: true })
  },
  {
    id: 'streamlit',
    name: 'Streamlit',
    category: 'python',
    description: 'Data apps and dashboards in pure Python, with pandas and NumPy included.',
    mark: 'Sl',
    color: '#ff4b4b',
    runtimes: ['python'],
    source: { pypi: 'streamlit' },
    docs: 'https://docs.streamlit.io',
    steps: (c) => [
      { label: 'Creating the Python project', run: ['uv', 'init', c.name, '--app', '--no-workspace', '--vcs', 'none'], cwd: 'parent' },
      { label: 'Adding Streamlit', run: ['uv', 'add', 'streamlit', 'pandas', 'numpy'], cwd: 'project' },
      { label: 'Writing app.py', write: 'app.py', content: STREAMLIT_APP(c.name) }
    ],
    dev: () => ({
      command: ['uv', 'run', 'streamlit', 'run', 'app.py', '--server.port', '{port}', '--server.address', '127.0.0.1', '--server.headless', 'true', '--server.enableCORS', 'false', '--server.enableXsrfProtection', 'false'],
      proxy: true
    })
  },

  // ------------------------------------------------------------- .NET
  {
    id: 'dotnet',
    name: 'ASP.NET Core',
    category: 'dotnet',
    description: 'C# web APIs, Blazor apps, MVC or Razor Pages, from Microsoft\'s own templates.',
    mark: 'C#',
    color: '#512bd4',
    runtimes: ['dotnet'],
    docs: 'https://learn.microsoft.com/aspnet/core',
    options: [
      {
        id: 'template',
        label: 'Template',
        choices: [
          { id: 'webapi', label: 'Web API' },
          { id: 'blazor', label: 'Blazor' },
          { id: 'mvc', label: 'MVC' },
          { id: 'webapp', label: 'Razor Pages' },
          { id: 'grpc', label: 'gRPC' }
        ],
        default: 'webapi'
      }
    ],
    steps: (c, o) => [{ label: `Running dotnet new ${o.template || 'webapi'}`, run: ['dotnet', 'new', o.template || 'webapi', '-n', c.ident, '-o', c.name], cwd: 'parent' }],
    dev: () => ({ command: ['dotnet', 'watch', 'run', '--non-interactive', '--urls', 'http://127.0.0.1:{port}'], proxy: true, env: { DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER: '1' } })
  },
  {
    id: 'dotnet-console',
    name: '.NET app',
    category: 'dotnet',
    description: 'A C# console app, background worker, or class library.',
    mark: '.N',
    color: '#68217a',
    runtimes: ['dotnet'],
    docs: 'https://learn.microsoft.com/dotnet/core',
    options: [
      {
        id: 'template',
        label: 'Template',
        choices: [
          { id: 'console', label: 'Console' },
          { id: 'worker', label: 'Worker service' },
          { id: 'classlib', label: 'Class library' }
        ],
        default: 'console'
      }
    ],
    steps: (c, o) => [{ label: `Running dotnet new ${o.template || 'console'}`, run: ['dotnet', 'new', o.template || 'console', '-n', c.ident, '-o', c.name], cwd: 'parent' }],
    dev: (o) => (o.template === 'classlib' ? null : { command: ['dotnet', 'watch', 'run', '--non-interactive'], proxy: false })
  },

  // ------------------------------------------------------------- Go and Rust
  {
    id: 'go',
    name: 'Go',
    category: 'systems',
    description: 'A Go web server using the standard library, or Gin.',
    mark: 'Go',
    color: '#00add8',
    runtimes: ['go'],
    source: { github: 'gin-gonic/gin' },
    docs: 'https://go.dev/doc',
    options: [
      {
        id: 'framework',
        label: 'Framework',
        choices: [
          { id: 'std', label: 'Standard library' },
          { id: 'gin', label: 'Gin' }
        ],
        default: 'std'
      }
    ],
    steps: (c, o) => [
      { label: 'Creating the folder', mkdir: true },
      { label: 'Running go mod init', run: ['go', 'mod', 'init', `example.com/${c.ident.toLowerCase()}`], cwd: 'project' },
      { label: 'Writing main.go', write: 'main.go', content: o.framework === 'gin' ? GIN_MAIN(c.name) : GO_MAIN(c.name) },
      ...(o.framework === 'gin' ? [{ label: 'Adding Gin', run: ['go', 'mod', 'tidy'], cwd: 'project' as const }] : [])
    ],
    dev: () => ({ command: ['go', 'run', '.'], proxy: true, env: { PORT: '{port}' } })
  },
  {
    id: 'rust',
    name: 'Rust',
    category: 'systems',
    description: 'A Rust web server with Axum and Tokio, from cargo new.',
    mark: 'Rs',
    color: '#b7410e',
    runtimes: ['rust'],
    source: { crates: 'axum' },
    docs: 'https://docs.rs/axum',
    steps: (c) => [
      { label: 'Running cargo new', run: ['cargo', 'new', c.name, '--vcs', 'none'], cwd: 'parent' },
      { label: 'Adding Axum and Tokio', run: ['cargo', 'add', 'axum', 'serde_json', 'tokio', '--features', 'tokio/full'], cwd: 'project' },
      { label: 'Writing src/main.rs', write: 'src/main.rs', content: AXUM_MAIN(c.name) }
    ],
    dev: () => ({ command: ['cargo', 'run'], proxy: true, env: { PORT: '{port}' } })
  },

  // ------------------------------------------------------------- Mobile and desktop
  {
    id: 'expo',
    name: 'Expo',
    category: 'mobile',
    description: 'React Native apps for iPhone, Android and the web. Open them on your phone with Expo Go.',
    mark: 'Ex',
    color: '#1b1f23',
    runtimes: ['node'],
    source: { npm: 'create-expo-app' },
    docs: 'https://docs.expo.dev',
    steps: (c) => [{ label: 'Running create-expo-app', run: npx('create-expo-app@latest', c.name, '--yes', '--no-install'), cwd: 'parent' }, npmInstall],
    dev: () => ({ command: ['npx', 'expo', 'start', '--port', '{port}'], proxy: true, env: { CI: '1' } })
  },
  {
    id: 'tauri',
    name: 'Tauri',
    category: 'desktop',
    description: 'Small, fast desktop apps with a web frontend and a Rust core.',
    mark: 'Ta',
    color: '#24c8db',
    runtimes: ['node', 'rust'],
    source: { npm: 'create-tauri-app' },
    docs: 'https://tauri.app/start',
    options: [
      {
        id: 'ui',
        label: 'Frontend',
        choices: [
          { id: 'react-ts', label: 'React' },
          { id: 'vue-ts', label: 'Vue' },
          { id: 'svelte-ts', label: 'Svelte' },
          { id: 'vanilla-ts', label: 'Plain' }
        ],
        default: 'react-ts'
      }
    ],
    steps: (c, o) => [{ label: 'Running create-tauri-app', run: npx('create-tauri-app@latest', c.name, '--template', o.ui || 'react-ts', '--manager', 'npm', '--yes'), cwd: 'parent' }, npmInstall],
    dev: () => ({ command: ['npm', 'run', 'tauri', 'dev'], proxy: false })
  },
  {
    id: 'electron',
    name: 'Electron',
    category: 'desktop',
    description: 'Desktop apps with web technology, from Electron Forge with Vite and TypeScript.',
    mark: 'Ee',
    color: '#47848f',
    runtimes: ['node'],
    source: { npm: 'create-electron-app' },
    docs: 'https://www.electronforge.io',
    steps: (c) => [{ label: 'Running create-electron-app', run: npx('create-electron-app@latest', c.name, '--template=vite-typescript'), cwd: 'parent' }],
    dev: () => ({ command: ['npm', 'start'], proxy: false })
  },

  // ------------------------------------------------------------- Swift
  {
    id: 'swiftui',
    name: 'SwiftUI app',
    category: 'apple',
    description: 'An iPhone, iPad or Mac app with a ready Xcode project. Opens in Xcode when done.',
    mark: 'Sw',
    color: '#f05138',
    runtimes: ['swift'],
    source: { github: 'yonaskolb/XcodeGen' },
    docs: 'https://developer.apple.com/tutorials/swiftui',
    note: 'Needs Xcode from the App Store. Laramac installs XcodeGen with Homebrew to make the project.',
    options: [
      {
        id: 'platform',
        label: 'Platform',
        choices: [
          { id: 'iOS', label: 'iPhone and iPad' },
          { id: 'macOS', label: 'Mac' }
        ],
        default: 'iOS'
      }
    ],
    steps: (c, o) => [
      { label: 'Creating the folder', mkdir: true },
      { label: 'Writing the app', write: 'Sources/App.swift', content: SWIFTUI_APP },
      { label: 'Writing the first screen', write: 'Sources/ContentView.swift', content: SWIFTUI_VIEW(c.name) },
      { label: 'Writing project.yml', write: 'project.yml', content: xcodeProjectSpec(c, o.platform === 'macOS' ? 'macOS' : 'iOS') },
      { label: 'Making the Xcode project', run: ['xcodegen', 'generate'], cwd: 'project' },
      { label: 'Opening Xcode', run: ['open', `${c.ident}.xcodeproj`], cwd: 'project' }
    ]
  },
  {
    id: 'vapor',
    name: 'Vapor',
    category: 'apple',
    description: 'Server-side Swift for web apps and APIs.',
    mark: 'Va',
    color: '#0d0d0d',
    runtimes: ['swift'],
    source: { github: 'vapor/vapor' },
    docs: 'https://docs.vapor.codes',
    note: 'Needs the Xcode command line tools. Laramac installs the Vapor toolbox with Homebrew.',
    steps: (c) => [{ label: 'Running vapor new', run: ['vapor', 'new', c.name, '-n'], cwd: 'parent' }],
    dev: () => ({ command: ['swift', 'run', 'App', 'serve', '--hostname', '127.0.0.1', '--port', '{port}'], proxy: true })
  },
  {
    id: 'swift-package',
    name: 'Swift package',
    category: 'apple',
    description: 'A command line tool or library with Swift Package Manager.',
    mark: 'Sp',
    color: '#fa7343',
    runtimes: ['swift'],
    docs: 'https://www.swift.org/documentation/package-manager',
    options: [
      {
        id: 'type',
        label: 'Type',
        choices: [
          { id: 'executable', label: 'Command line tool' },
          { id: 'library', label: 'Library' }
        ],
        default: 'executable'
      }
    ],
    steps: (c, o) => [
      { label: 'Creating the folder', mkdir: true },
      { label: 'Running swift package init', run: ['swift', 'package', 'init', '--type', o.type === 'library' ? 'library' : 'executable', '--name', c.ident], cwd: 'project' }
    ]
  }
]

/** Extra command line tools some starters need, installed with Homebrew when missing. */
/** A database or backend for JavaScript projects: written to .env, with Supabase and Firebase running locally. */
export const DATA_CHOICES = [
  { id: 'none', label: 'None' },
  { id: 'supabase', label: 'Supabase' },
  { id: 'firebase', label: 'Firebase' },
  { id: 'pgsql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'sqlite', label: 'SQLite' }
]
const WITH_DATA = new Set(['nextjs', 'nuxt', 'sveltekit', 'react-router', 'astro', 'react', 'vue', 'angular', 'vite', 'nestjs', 'hono', 'elysia', 'expo'])
for (const s of STARTERS) {
  if (WITH_DATA.has(s.id) && !s.options?.some((o) => o.id === 'data')) s.options = [...(s.options ?? []), { id: 'data', label: 'Database', choices: DATA_CHOICES, default: 'none' }]
}

export const BREW_TOOLS: Record<string, string> = { xcodegen: 'xcodegen', vapor: 'vapor' }

export const starterById = (id: string): Starter | undefined => STARTERS.find((s) => s.id === id)

/** Fills in defaults and drops unknown values, so only real choices reach a command. */
export function resolveOptions(s: Starter, given: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const opt of s.options ?? []) {
    const v = given[opt.id]
    out[opt.id] = typeof v === 'string' && opt.choices.some((c) => c.id === v) ? v : opt.default
  }
  return out
}

export function starterContext(name: string, tld: string): StarterContext {
  const s = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  let ident = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'App'
  if (/^[0-9]/.test(ident)) ident = `App${ident}`
  return { name, domain: `${s}.${tld}`, db: s.replace(/-/g, '_'), tld, ident }
}

/** Replaces {port} in a dev command or its environment. */
export function fillPort<T extends string[] | Record<string, string>>(v: T, port: number): T {
  if (Array.isArray(v)) return v.map((x) => x.replaceAll('{port}', String(port))) as T
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.replaceAll('{port}', String(port))])) as T
}

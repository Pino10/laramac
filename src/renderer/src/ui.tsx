import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ServiceStatus } from '@shared/types'

export function Switch({
  on,
  onChange,
  disabled,
  label
}: {
  on: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="switch no-drag"
      disabled={disabled}
      onClick={onChange}
    />
  )
}

export const statusText: Record<ServiceStatus, string> = {
  'not-installed': 'Not installed',
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  error: 'Failed'
}

export function Lamp({ status }: { status: ServiceStatus }): React.JSX.Element {
  return <span className="lamp" data-s={status} aria-hidden />
}

/** Each service's own colour and letters, so rows read at a glance. */
export const SERVICE_LOOK: Record<string, [string, string]> = {
  apache: ['Ap', '#c9283e'],
  nginx: ['Nx', '#109a52'],
  php: ['Php', '#6f74b8'],
  mysql: ['My', '#0f7891'],
  mariadb: ['Ma', '#b36b4d'],
  postgres: ['Pg', '#3b6ea8'],
  redis: ['Re', '#d8382d'],
  memcached: ['Mc', '#1f9c90'],
  mongodb: ['Mo', '#3f9a44'],
  meilisearch: ['Me', '#e0457b'],
  mailpit: ['@', '#3d7cf0']
}

export function ServiceIcon({ id, status }: { id: string; status: ServiceStatus }): React.JSX.Element {
  const [letters, hue] = SERVICE_LOOK[id] ?? [id.slice(0, 2), '#8a8f9c']
  return (
    <span className="svc-icon" style={{ ['--hue' as string]: hue }} data-off={status === 'not-installed'} aria-hidden>
      {letters}
      {status !== 'not-installed' && <Lamp status={status} />}
    </span>
  )
}

export function PageHead({
  title,
  desc,
  children
}: {
  title: string
  desc?: React.ReactNode
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {children && <div className="page-actions no-drag">{children}</div>}
    </div>
  )
}

/** Each framework and engine gets its own recognisable colour. */
const HUES: Record<string, [string, string]> = {
  wordpress: ['Wp', '#2271b1'],
  laravel: ['La', '#f05340'],
  symfony: ['Sy', '#7a7f87'],
  php: ['Ph', '#7a7fc8'],
  node: ['No', '#3c9a3f'],
  static: ['Ht', '#8a919c'],
  mysql: ['My', '#00758f'],
  mariadb: ['Ma', '#c0765a'],
  postgres: ['Pg', '#4a7bb5'],
  redis: ['Rd', '#d83b2f'],
  mongodb: ['Mg', '#1ea55a'],
  mailpit: ['Mp', '#8b6fd6'],
  memcached: ['Mc', '#1f9c90'],
  meilisearch: ['Me', '#e0457b'],
  adminer: ['Ad', '#34567a']
}

export function Monogram({ id, large }: { id: string; large?: boolean }): React.JSX.Element {
  const [letters, hue] = HUES[id] ?? [id.slice(0, 2), '#8a919c']
  return (
    <span className={large ? 'mono-tile lg' : 'mono-tile'} style={{ ['--hue' as string]: hue }} aria-hidden>
      {letters}
    </span>
  )
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function CopyField({ value }: { value: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <div className="copyfield no-drag">
      <span className="mono">{value}</span>
      <button
        className="btn btn-quiet btn-icon"
        style={{ height: 22, width: 22 }}
        title={copied ? 'Copied' : 'Copy'}
        aria-label={`Copy ${value}`}
        onClick={() => {
          navigator.clipboard?.writeText(value).catch(() => undefined)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

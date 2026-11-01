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

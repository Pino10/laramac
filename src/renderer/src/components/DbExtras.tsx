import { useEffect, useState } from 'react'
import { Archive, FolderOpen, GitCompare, Shuffle } from 'lucide-react'
import type { DatabaseInfo } from '@shared/types'
import { useApp } from '../store'
import { Switch } from '../ui'

type Diff = { onlyA: string[]; onlyB: string[]; changed: { table: string; column: string; a: string; b: string }[]; missingColumns: { table: string; column: string; side: 'a' | 'b' }[] }

/** Daily backups, scrambling personal data in a local copy, and comparing schemas, for one database. */
export default function DbExtras({ db, all }: { db: DatabaseInfo; all: DatabaseInfo[] }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = window.laramac
  const [daily, setDaily] = useState(false)
  const [plan, setPlan] = useState<{ table: string; column: string; sql: string }[] | null>(null)
  const [typed, setTyped] = useState('')
  const [other, setOther] = useState('')
  const [diff, setDiff] = useState<Diff | null>(null)
  useEffect(() => {
    void api.invoke('db:backups').then((b) => setDaily(b.scheduled.some((x) => x.engine === db.engine && x.name === db.name)))
  }, [api, db.engine, db.name])
  const peers = all.filter((x) => x.engine === db.engine && x.name !== db.name)
  return (
    <div className="db-extras">
      <div className="row row-set">
        <div className="row-main">
          <div className="row-title"><Archive size={13} /> Daily backup</div>
          <div className="row-sub">Once a day while the server runs, kept in Laramac’s backups folder (the newest 7).</div>
        </div>
        <button className="btn btn-sm" disabled={busy.has(`bk-${db.name}`)} onClick={() => act(`bk-${db.name}`, () => api.invoke('db:backup-now', db.engine, db.name))}>
          {busy.has(`bk-${db.name}`) ? 'Backing up…' : 'Back up now'}
        </button>
        <Switch on={daily} label="Daily backup" onChange={async () => { const r = await act(`bks-${db.name}`, () => api.invoke('db:backup-schedule', db.engine, db.name, !daily)); if (r) setDaily(r.some((x) => x.engine === db.engine && x.name === db.name)) }} />
      </div>
      <div className="row row-set">
        <div className="row-main">
          <div className="row-title"><Shuffle size={13} /> Scramble personal data</div>
          <div className="row-sub" style={{ whiteSpace: 'normal' }}>For a copy of production on this Mac: replaces emails, names, phone numbers, addresses, IPs and birth dates with fake ones. A backup is saved first.</div>
        </div>
        <button className="btn btn-sm" onClick={async () => setPlan((await act(`scr-${db.name}`, () => api.invoke('db:scramble-plan', db.engine, db.name))) ?? null)}>
          Check columns
        </button>
      </div>
      {plan && (
        <div className="pad">
          {plan.length === 0 ? (
            <p className="hint">No columns with personal data were found by name.</p>
          ) : (
            <>
              <p className="hint">{plan.length} columns: {plan.map((p) => `${p.table}.${p.column}`).join(', ')}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input mono" placeholder={`Type ${db.name} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} />
                <button
                  className="btn btn-sm"
                  style={{ color: 'var(--bad)' }}
                  disabled={typed !== db.name || busy.has(`scr2-${db.name}`)}
                  onClick={async () => {
                    const n = await act(`scr2-${db.name}`, () => api.invoke('db:scramble', db.engine, db.name, typed))
                    if (n !== undefined) {
                      notify({ kind: 'info', text: `Scrambled ${n} columns in ${db.name}.` })
                      setPlan(null)
                      setTyped('')
                    }
                  }}
                >
                  Scramble
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {peers.length > 0 && (
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title"><GitCompare size={13} /> Compare the structure</div>
            <div className="row-sub">Tables and columns that differ from another database, such as a teammate’s copy.</div>
          </div>
          <select className="input select" style={{ width: 200 }} value={other} onChange={(e) => setOther(e.target.value)} aria-label="Compare with">
            <option value="">Compare with…</option>
            {peers.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
          <button className="btn btn-sm" disabled={!other} onClick={async () => setDiff((await act(`cmp-${db.name}`, () => api.invoke('db:schema-diff', db.engine, db.name, other))) ?? null)}>
            Compare
          </button>
        </div>
      )}
      {diff && (
        <div className="pad schema-diff">
          {!diff.onlyA.length && !diff.onlyB.length && !diff.changed.length && !diff.missingColumns.length ? (
            <p className="hint">The structures are the same.</p>
          ) : (
            <ul>
              {diff.onlyA.map((t) => <li key={`a${t}`}>Table <b>{t}</b> only in {db.name}</li>)}
              {diff.onlyB.map((t) => <li key={`b${t}`}>Table <b>{t}</b> only in {other}</li>)}
              {diff.missingColumns.map((c) => <li key={`m${c.table}${c.column}`}><b>{c.table}.{c.column}</b> only in {c.side === 'b' ? db.name : other}</li>)}
              {diff.changed.map((c) => <li key={`c${c.table}${c.column}`}><b>{c.table}.{c.column}</b>: {c.a} here, {c.b} in {other}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function BackupsFolderButton(): React.JSX.Element {
  return (
    <button className="btn btn-sm" onClick={() => window.laramac.invoke('db:backup-reveal')}>
      <FolderOpen size={13} /> Backups folder
    </button>
  )
}

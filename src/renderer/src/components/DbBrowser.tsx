import { useEffect, useState } from 'react'
import { Play, Table2 } from 'lucide-react'
import { useApp } from '../store'

type Result = { columns: string[]; rows: string[][]; truncated: boolean }

/** Tables of a MySQL or MariaDB database, and a read-only query box: no phpMyAdmin needed to look. */
export default function DbBrowser({ engine, name }: { engine: 'mysql' | 'mariadb'; name: string }): React.JSX.Element {
  const { act, busy } = useApp()
  const api = window.laramac
  const [tables, setTables] = useState<{ name: string; rows: string }[] | null>(null)
  const [sql, setSql] = useState('')
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setTables(null)
    setRes(null)
    void api
      .invoke('db:tables', engine, name)
      .then(setTables)
      .catch((e: Error) => setErr(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  }, [api, engine, name])
  const run = async (q = sql): Promise<void> => {
    setErr(null)
    try {
      setRes(await api.invoke('db:query', engine, name, q))
    } catch (e) {
      setErr((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }
  const open = (t: string): void => {
    const q = `SELECT * FROM \`${t}\` LIMIT 100`
    setSql(q)
    void run(q)
  }
  return (
    <div className="dbb">
      <div className="dbb-tables">
        <div className="hint" style={{ padding: '4px 8px 8px' }}>
          {tables ? `${tables.length} tables` : 'Loading…'}
        </div>
        {tables?.map((t) => (
          <button key={t.name} className="dbb-table" onClick={() => open(t.name)}>
            <Table2 size={13} /> <span>{t.name}</span> <span className="hint">{t.rows === 'NULL' ? '' : t.rows}</span>
          </button>
        ))}
      </div>
      <div className="dbb-main">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input mono" placeholder={`SELECT * FROM users LIMIT 20`} value={sql} onChange={(e) => setSql(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void act('dbq', () => run())} aria-label="Query" />
          <button className="btn btn-primary" disabled={!sql.trim() || busy.has('dbq')} onClick={() => void act('dbq', () => run())}>
            <Play size={13} /> Run
          </button>
        </div>
        <div className="hint" style={{ margin: '6px 2px 10px' }}>
          Read-only: SELECT, SHOW, DESCRIBE and EXPLAIN. To change data, use phpMyAdmin or your app.
        </div>
        {err && <div className="notice bad">{err}</div>}
        {res && (
          <div className="dbb-grid">
            <table>
              <thead>
                <tr>
                  {res.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j} title={v}>
                        {v === 'NULL' ? <span className="hint">NULL</span> : v.length > 120 ? `${v.slice(0, 120)}…` : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {res.truncated && <div className="hint" style={{ padding: 8 }}>Showing the first 500 rows.</div>}
            {res.rows.length === 0 && <div className="hint" style={{ padding: 8 }}>No rows.</div>}
          </div>
        )}
      </div>
    </div>
  )
}

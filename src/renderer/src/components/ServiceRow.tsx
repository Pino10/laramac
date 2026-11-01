import type { ServiceInfo } from '@shared/types'
import { useApp } from '../store'
import { CopyField, ServiceIcon, Switch, statusText } from '../ui'

/** One service: status lamp, name, port, state, and a switch or install button. */
export default function ServiceRow({
  service: s,
  withConnection
}: {
  service: ServiceInfo
  withConnection?: boolean
}): React.JSX.Element {
  const { busy, act, setServices } = useApp()
  const api = window.laramac
  const installing = busy.has(`install-${s.id}`)

  const control =
    s.status === 'not-installed' ? (
      <button
        className="btn no-drag"
        disabled={installing}
        onClick={() =>
          act(`install-${s.id}`, async () => {
            await api.invoke('services:install', s.id)
            setServices(await api.invoke('services:list'))
          })
        }
      >
        {installing ? 'Installing' : 'Install'}
      </button>
    ) : (
      <Switch
        on={s.status === 'running' || s.status === 'starting'}
        disabled={s.status === 'starting' || busy.has(`toggle-${s.id}`)}
        label={`${s.name} ${s.status === 'running' ? 'on' : 'off'}`}
        onChange={() => act(`toggle-${s.id}`, () => api.invoke('services:toggle', s.id).then(setServices))}
      />
    )

  if (withConnection) {
    return (
      <div className="row row-db">
        <ServiceIcon id={s.id} status={s.status} />
        <div className="row-main">
          <div className="row-title">
            {s.name}
            {s.version && <span className="tag">{s.version}</span>}
          </div>
          <div className="row-sub">{statusText[s.status]}</div>
        </div>
        {s.connection ? <CopyField value={s.connection} /> : <span />}
        <div className="end">{control}</div>
        {s.status === 'error' && s.error && <div className="errbox">{s.error}</div>}
      </div>
    )
  }

  return (
    <div className="row row-svc">
      <ServiceIcon id={s.id} status={s.status} />
      <div className="row-main">
        <div className="row-title">
          {s.name}
          {s.version && <span className="tag">{s.version}</span>}
        </div>
        <div className="row-sub">{s.description}</div>
      </div>
      <span className="num">{s.port ? `Port ${s.port}` : ''}</span>
      <span className="status" data-s={s.status}>
        {statusText[s.status]}
      </span>
      <div className="end">{control}</div>
      {s.status === 'error' && s.error && <div className="errbox">{s.error}</div>}
    </div>
  )
}

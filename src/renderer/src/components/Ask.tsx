import { useCallback, useRef, useState } from 'react'

interface AskOptions {
  title: string
  label?: string
  initial?: string
  secret?: boolean
  confirm?: string
  danger?: boolean
  /** Ask a yes/no question instead of asking for text. */
  yesNo?: boolean
}

/**
 * Electron has no window.prompt, so questions get a small in-app dialog.
 * const [ask, dialog] = useAsk(); const name = await ask({ title: 'Folder name' })
 */
export function useAsk(): [(o: AskOptions) => Promise<string | null>, React.JSX.Element | null] {
  const [state, setState] = useState<(AskOptions & { value: string }) | null>(null)
  const resolver = useRef<((v: string | null) => void) | null>(null)

  const ask = useCallback((o: AskOptions) => {
    setState({ ...o, value: o.initial ?? '' })
    return new Promise<string | null>((res) => {
      resolver.current = res
    })
  }, [])

  const finish = (v: string | null): void => {
    resolver.current?.(v)
    resolver.current = null
    setState(null)
  }

  const dialog = state ? (
    <div className="scrim" style={{ zIndex: 70 }} onMouseDown={() => finish(null)}>
      <div className="dialog glass" style={{ width: 420 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>
          {state.title}
        </h2>
        {!state.yesNo && (
          <div className="field">
            {state.label && <label htmlFor="ask-input">{state.label}</label>}
            <input
              id="ask-input"
              className="input"
              autoFocus
              type={state.secret ? 'password' : 'text'}
              value={state.value}
              onChange={(e) => setState((s) => (s ? { ...s, value: e.target.value } : s))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finish(state.value)
                if (e.key === 'Escape') finish(null)
              }}
            />
          </div>
        )}
        <div className="end">
          <button className="btn" onClick={() => finish(null)}>
            Cancel
          </button>
          <button className={state.danger ? 'btn btn-danger' : 'btn btn-primary'} autoFocus={state.yesNo} onClick={() => finish(state.yesNo ? 'yes' : state.value)}>
            {state.confirm ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return [ask, dialog]
}

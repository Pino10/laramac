import { ArrowRight, CheckCircle2, ShieldCheck, X } from 'lucide-react'
import { useApp } from '../store'

/** What to do next, right after a repository lands in your projects folder. */
export default function AfterClone({ name, onClose }: { name: string; onClose: () => void }): React.JSX.Element {
  const { showSite, setPage, setReviewSite } = useApp()
  return (
    <div className="after-clone glass" role="status">
      <span className="after-ic">
        <CheckCircle2 size={20} />
      </span>
      <div className="after-text">
        <strong>{name} is in your projects folder</strong>
        <span>What next? Open it to set it up and run it, or check its code for security problems first.</span>
      </div>
      <div className="after-actions">
        <button className="btn btn-primary btn-sm" onClick={() => showSite(name)}>
          Open it <ArrowRight size={13} />
        </button>
        <button
          className="btn btn-sm"
          onClick={() => {
            setReviewSite(name)
            setPage('security')
          }}
        >
          <ShieldCheck size={13} /> Review its code
        </button>
        <button className="icon-btn" aria-label="Dismiss" onClick={onClose}>
          <X />
        </button>
      </div>
    </div>
  )
}

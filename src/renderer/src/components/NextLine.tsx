import { ArrowRight } from 'lucide-react'

/** One calm line that says what is off and what to do about it, with the button that does it. */
export default function NextLine({ children, action, onAction }: { children: React.ReactNode; action: string; onAction: () => void }): React.JSX.Element {
  return (
    <div className="next-line" role="status">
      <span>{children}</span>
      <button className="btn btn-primary btn-sm" onClick={onAction}>
        {action} <ArrowRight size={13} />
      </button>
    </div>
  )
}

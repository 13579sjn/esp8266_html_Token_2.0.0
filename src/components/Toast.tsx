import { AlertTriangleIcon, CheckIcon } from './Icons'

export type ToastType = 'success' | 'error'

export interface ToastState {
  id: number
  type: ToastType
  message: string
}

export function Toast({ toast }: { toast: ToastState | null }) {
  return (
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
      {toast ? (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? <CheckIcon size={15} /> : <AlertTriangleIcon size={15} />}
          </span>
          <span>{toast.message}</span>
        </div>
      ) : null}
    </div>
  )
}

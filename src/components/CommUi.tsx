import type { ReactNode } from 'react'

import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
} from './Icons'

export interface CommCopyProps {
  id: string
  text: string
  label: string
  copiedId: string | null
  onCopy: (id: string, text: string, label: string) => void
  disabled?: boolean
  className?: string
  compact?: boolean
  variant?: 'default' | 'dark'
}

export function CommCopyButton({
  id,
  text,
  label,
  copiedId,
  onCopy,
  disabled,
  className,
  compact,
  variant = 'default',
}: CommCopyProps) {
  const copied = copiedId === id
  return (
    <button
      type="button"
      className={`copy-inline${variant === 'dark' ? ' on-dark' : ''}${
        copied ? ' is-copied' : ''
      }${className ? ` ${className}` : ''}`}
      onClick={() => onCopy(id, text, label)}
      disabled={disabled || !text}
      aria-label={copied ? `${label}已复制` : `复制${label}`}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {compact ? null : copied ? '已复制' : '复制'}
    </button>
  )
}

interface CommCodeProps {
  heading: string
  note?: string
  code: string
  emptyText?: string
  copy: Omit<CommCopyProps, 'text'>
  className?: string
}

export function CommCode({
  heading,
  note,
  code,
  emptyText,
  copy,
  className,
}: CommCodeProps) {
  return (
    <div className={`code-wrap comm-code${className ? ` ${className}` : ''}`}>
      <div className="code-bar">
        <span>{heading}</span>
        <div className="comm-code-actions">
          {note ? <span className="comm-code-note">{note}</span> : null}
          <CommCopyButton {...copy} text={code} />
        </div>
      </div>
      <pre className="code-pre">{code || emptyText || '—'}</pre>
    </div>
  )
}

interface CommAlertProps {
  title: string
  items?: string[]
  tone?: 'error' | 'warn'
  children?: ReactNode
}

export function CommAlert({ title, items, tone = 'error', children }: CommAlertProps) {
  return (
    <div className={`comm-alert comm-alert-${tone}`} role="alert">
      <AlertTriangleIcon size={16} />
      <div>
        <strong>{title}</strong>
        {items && items.length > 0 ? (
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {children}
      </div>
    </div>
  )
}

export function CommFieldError({
  id,
  children,
}: {
  id?: string
  children: ReactNode
}) {
  return (
    <p className="comm-field-error" id={id} role="alert">
      {children}
    </p>
  )
}

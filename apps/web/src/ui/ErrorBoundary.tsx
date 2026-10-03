import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../copy'
import { Button } from './Button'
import { Icon } from './Icon'

interface State {
  error: Error | null
}

/** Catches render errors in a subtree and shows a Persian fallback with reload; never leaks stack traces to the UI except in dev. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: (e: Error, reset: () => void) => ReactNode; onError?: (e: Error, info: ErrorInfo) => void }, State> {
  override state: State = { error: null }
  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }
  reset = (): void => this.setState({ error: null })
  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
          <Icon name="alert" size={26} />
        </span>
        <h1 className="text-xl font-bold">{t('system.errorTitle')}</h1>
        <p className="text-sm text-muted">{t('system.errorBody')}</p>
        {import.meta.env?.DEV ? (
          <details className="w-full text-start text-xs text-subtle">
            <summary className="cursor-pointer">{t('system.errorDetails')}</summary>
            <pre className="ltr mt-2 overflow-auto rounded-md bg-surface-2 p-2">{error.message}</pre>
          </details>
        ) : null}
        <div className="flex gap-2">
          <Button onClick={this.reset} variant="secondary">{t('common.retry')}</Button>
          <Button onClick={() => window.location.reload()}>{t('system.reload')}</Button>
        </div>
      </div>
    )
  }
}

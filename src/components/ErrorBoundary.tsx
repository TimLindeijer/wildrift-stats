import { Component, type ReactNode } from 'react'
import { forgetFailedLoads } from '../data/load.ts'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: (error: Error, retry: () => void) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  retry = () => {
    forgetFailedLoads()
    this.setState({ error: null })
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.retry) : this.props.children
  }
}

import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Ứng dụng gặp lỗi</div>
          <div style={{ whiteSpace: 'pre-wrap', color: '#991B1B' }}>{this.state.error.message}</div>
          <div style={{ marginTop: 12, color: '#6B7280' }}>
            Mở DevTools Console để xem stacktrace.
          </div>
        </div>
      )
    }
    return this.props.children
  }
}


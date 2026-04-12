import React from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { WelcomePage } from './pages/WelcomePage'
import { ConfigEditorPage } from './pages/ConfigEditorPage'
import { ExecutionPage } from './pages/ExecutionPage'
import { HistoryPage } from './pages/HistoryPage'
import { LogsPage } from './pages/LogsPage'
import { useStore } from './hooks/use-store'

const pages = {
  welcome: WelcomePage,
  config: ConfigEditorPage,
  execution: ExecutionPage,
  history: HistoryPage,
  logs: LogsPage
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-destructive">Something went wrong</h2>
            <pre className="bg-zinc-950 text-red-400 p-4 rounded text-xs overflow-auto max-h-60 whitespace-pre-wrap">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm"
              onClick={() => this.setState({ error: null })}
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const page = useStore((s) => s.page)
  const Page = pages[page]

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <ErrorBoundary key={page}>
          <Page />
        </ErrorBoundary>
      </div>
    </div>
  )
}

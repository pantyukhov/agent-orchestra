import React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { DashboardPage } from './pages/DashboardPage'
import { ConfigEditorPage } from './pages/ConfigEditorPage'
import { HistoryPage } from './pages/HistoryPage'
import { LogsPage } from './pages/LogsPage'
import { SettingsPage } from './pages/SettingsPage'
import { useStore } from './hooks/use-store'

const pages = {
  dashboard: DashboardPage,
  config: ConfigEditorPage,
  history: HistoryPage,
  logs: LogsPage,
  settings: SettingsPage
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-lg space-y-4">
            <h2 className="text-[13px] text-destructive">Something went wrong</h2>
            <pre className="bg-foreground/[0.04] p-4 rounded-lg text-[11px] overflow-auto max-h-60 whitespace-pre-wrap text-muted-foreground">{this.state.error.message}</pre>
            <button className="ao-btn-ghost" onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const page = useStore((s) => s.page)
  const Page = pages[page as keyof typeof pages] || DashboardPage

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <ErrorBoundary key={page}>
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              className="flex flex-1 flex-col min-h-0"
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <Page />
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </div>
    </div>
  )
}

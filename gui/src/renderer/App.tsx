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

export default function App() {
  const page = useStore((s) => s.page)
  const Page = pages[page]

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <Page />
      </div>
    </div>
  )
}

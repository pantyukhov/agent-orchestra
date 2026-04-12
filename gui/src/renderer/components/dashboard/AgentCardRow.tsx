import { AgentCard } from './AgentCard'
import type { AgentViewModel } from '../../lib/agent-utils'

interface AgentCardRowProps {
  agents: AgentViewModel[]
  isEngineRunning: boolean
  runningConfigPath: string | null
  onRun: (configPath: string) => void
  onStop: () => void
  onLogs: (configPath: string) => void
}

export function AgentCardRow({ agents, isEngineRunning, runningConfigPath, onRun, onStop, onLogs }: AgentCardRowProps) {
  return (
    <div className="flex gap-4 overflow-x-auto px-8 py-6" style={{ scrollbarWidth: 'none' }}>
      {agents.map((agent) => (
        <AgentCard
          key={agent.configPath}
          agent={agent}
          isEngineRunning={isEngineRunning}
          runningConfigPath={runningConfigPath}
          onRun={onRun}
          onStop={onStop}
          onLogs={onLogs}
        />
      ))}
    </div>
  )
}

import type { AgentViewModel, AgentStatus } from '../../lib/agent-utils'

interface AgentCardProps {
  agent: AgentViewModel
  isEngineRunning: boolean
  runningConfigPath: string | null
  onRun: (configPath: string) => void
  onStop: () => void
  onLogs: (configPath: string) => void
}

const statusConfig: Record<AgentStatus, { color: string; label: string; shadow?: string }> = {
  running: { color: '#30d158', label: 'Running', shadow: '0 0 6px rgba(48,209,88,0.5)' },
  success: { color: '#30d158', label: 'Success' },
  failed: { color: '#ff453a', label: 'Failed' },
  stale: { color: '#86868b', label: 'Stale' },
  idle: { color: '#48484a', label: 'Idle' }
}

export function AgentCard({ agent, isEngineRunning, runningConfigPath, onRun, onStop, onLogs }: AgentCardProps) {
  const st = statusConfig[agent.status]
  const isThisRunning = runningConfigPath === agent.configPath
  const canRun = !isEngineRunning || isThisRunning
  const isFailed = agent.status === 'failed'

  return (
    <div
      className="flex-shrink-0 rounded-2xl p-5"
      style={{
        minWidth: 210,
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: `1px solid ${isFailed ? 'rgba(255,69,58,0.2)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {/* Header: avatar + name + status */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center text-white font-semibold"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: `linear-gradient(145deg, ${agent.gradient.from}, ${agent.gradient.to})`,
            boxShadow: `0 4px 12px ${agent.gradient.from}4d`,
            fontSize: 16,
          }}
        >
          {agent.initials}
        </div>
        <div>
          <div className="text-[15px] font-semibold text-[#f5f5f7]" style={{ letterSpacing: '-0.2px' }}>
            {agent.name}
          </div>
          <div className="flex items-center gap-[5px] mt-[3px]">
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: st.color,
                boxShadow: st.shadow,
                animation: agent.status === 'running' ? 'pulse 2s ease-in-out infinite' : undefined,
              }}
            />
            <span className="text-xs font-medium" style={{ color: st.color }}>
              {st.label}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex justify-between text-xs text-[#86868b] mb-[14px]">
        <span>{agent.lastRunRelative || '—'}</span>
        <span
          className="font-medium"
          style={{ color: agent.successRate >= 80 ? '#30d158' : agent.successRate >= 50 ? '#ff9f0a' : '#ff453a' }}
        >
          {agent.runs.length > 0 ? `${agent.successRate}%` : '—'}
        </span>
      </div>

      {/* Separator */}
      <div className="h-px mb-[14px]" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Actions */}
      <div className="flex gap-2">
        {isThisRunning ? (
          <button
            className="flex-1 text-center py-[7px] rounded-lg text-xs font-medium cursor-pointer"
            style={{ background: 'rgba(255,69,58,0.15)', color: '#ff453a' }}
            onClick={() => onStop()}
          >
            Stop
          </button>
        ) : (
          <button
            className="flex-1 text-center py-[7px] rounded-lg text-xs font-medium"
            style={{
              background: canRun ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.03)',
              color: canRun ? '#0a84ff' : '#48484a',
              cursor: canRun ? 'pointer' : 'not-allowed',
            }}
            onClick={() => canRun && onRun(agent.configPath)}
            disabled={!canRun}
          >
            {agent.status === 'failed' ? '▶ Retry' : '▶ Run'}
          </button>
        )}
        <button
          className="flex-1 text-center py-[7px] rounded-lg text-xs font-medium cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#86868b' }}
          onClick={() => onLogs(agent.configPath)}
        >
          Logs
        </button>
      </div>
    </div>
  )
}

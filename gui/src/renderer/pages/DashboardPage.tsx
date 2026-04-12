import { useEffect, useState, useCallback } from 'react'
import { useStore } from '../hooks/use-store'
import { AgentCardRow } from '../components/dashboard/AgentCardRow'
import { TimelinePeriodPicker, type Period } from '../components/dashboard/TimelinePeriodPicker'
import { TimelineGrid } from '../components/dashboard/TimelineGrid'
import { WorkspaceModal } from '../components/dashboard/WorkspaceModal'
import { buildAgentViewModel, type AgentViewModel } from '../lib/agent-utils'
import type { Config } from '../types/config'
import type { RunRecord } from '../types/state'

export function DashboardPage() {
  const workspacePath = useStore((s) => s.workspacePath)
  const workspaceConfigs = useStore((s) => s.workspaceConfigs)
  const processStatus = useStore((s) => s.processStatus)
  const setPage = useStore((s) => s.setPage)
  const setSelectedRun = useStore((s) => s.setSelectedRun)
  const setRunHistory = useStore((s) => s.setRunHistory)

  const [agents, setAgents] = useState<AgentViewModel[]>([])
  const [period, setPeriod] = useState<Period>('week')
  const [runningConfigPath, setRunningConfigPath] = useState<string | null>(null)

  const isEngineRunning = processStatus === 'running'

  // Load agent data
  const loadAgents = useCallback(async () => {
    if (!workspacePath) return

    const history: RunRecord[] = await window.electronAPI.getWorkspaceHistory(workspacePath)
    setRunHistory(history)

    const agentViewModels: AgentViewModel[] = []
    for (const configPath of workspaceConfigs) {
      try {
        const config: Config = await window.electronAPI.loadConfigFile(configPath)
        const name = config.pipeline?.name ?? config.orchestrator?.name ?? configPath.split('/').pop()?.replace(/\.ya?ml$/, '') ?? 'Unknown'
        agentViewModels.push(buildAgentViewModel(configPath, name, history))
      } catch {
        // Skip invalid configs
      }
    }

    setAgents(agentViewModels)
  }, [workspacePath, workspaceConfigs, setRunHistory])

  // Initial load
  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // Periodic refresh (30s safety net)
  useEffect(() => {
    if (!workspacePath) return
    const interval = setInterval(loadAgents, 30000)
    return () => clearInterval(interval)
  }, [workspacePath, loadAgents])

  // Subscribe to engine events for live updates
  useEffect(() => {
    const unsubStatus = window.electronAPI.onProcessStatusChange((status) => {
      useStore.getState().setProcessStatus(status)
      if (status === 'stopped') {
        setRunningConfigPath(null)
        loadAgents() // Refresh on completion
      }
    })

    return () => {
      unsubStatus()
    }
  }, [loadAgents])

  // Actions — once=true for dashboard Run (single execution, not looping)
  async function handleRun(configPath: string) {
    setRunningConfigPath(configPath)
    await window.electronAPI.startProcess(configPath, true)
  }

  async function handleStop() {
    await window.electronAPI.stopProcess()
    setRunningConfigPath(null)
  }

  function handleLogs(configPath: string) {
    setPage('logs')
  }

  function handleTimelineBarClick(run: RunRecord) {
    setSelectedRun(run)
    setPage('history')
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#000000' }}>
      <WorkspaceModal open={!workspacePath} />

      {workspacePath && (
        <>
          {/* Header */}
          <div className="flex items-baseline justify-between pt-7 px-8">
            <div>
              <div className="text-[28px] font-bold text-[#f5f5f7]" style={{ letterSpacing: '-0.5px' }}>
                My Agents
              </div>
              <div className="text-[13px] text-[#86868b] mt-1">
                {agents.length} agent{agents.length !== 1 ? 's' : ''}
                {agents.filter((a) => a.status === 'running').length > 0 &&
                  ` · ${agents.filter((a) => a.status === 'running').length} active`}
              </div>
            </div>
            <TimelinePeriodPicker value={period} onChange={setPeriod} />
          </div>

          {/* Agent Cards */}
          {agents.length > 0 ? (
            <AgentCardRow
              agents={agents}
              isEngineRunning={isEngineRunning}
              runningConfigPath={runningConfigPath}
              onRun={handleRun}
              onStop={handleStop}
              onLogs={handleLogs}
            />
          ) : (
            <div className="flex items-center justify-center py-16 text-sm text-[#48484a]">
              No agents in this workspace
            </div>
          )}

          {/* Timeline */}
          <TimelineGrid agents={agents} period={period} onBarClick={handleTimelineBarClick} />
        </>
      )}

      {/* Pulse animation for running indicators */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

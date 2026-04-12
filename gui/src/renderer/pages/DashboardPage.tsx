import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
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

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  useEffect(() => {
    if (!workspacePath) return
    const interval = setInterval(loadAgents, 30000)
    return () => clearInterval(interval)
  }, [workspacePath, loadAgents])

  useEffect(() => {
    const unsubStatus = window.electronAPI.onProcessStatusChange((status) => {
      useStore.getState().setProcessStatus(status)
      if (status === 'stopped') {
        setRunningConfigPath(null)
        loadAgents()
      }
    })
    return () => unsubStatus()
  }, [loadAgents])

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

      <AnimatePresence>
        {workspacePath && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex items-baseline justify-between pt-7 px-8"
            >
              <div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
                  className="text-[28px] font-bold text-[#f5f5f7]"
                  style={{ letterSpacing: '-0.5px' }}
                >
                  My Agents
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-[13px] text-[#86868b] mt-1"
                >
                  {agents.length} agent{agents.length !== 1 ? 's' : ''}
                  {agents.filter((a) => a.status === 'running').length > 0 &&
                    ` · ${agents.filter((a) => a.status === 'running').length} active`}
                </motion.div>
              </div>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 25 }}
              >
                <TimelinePeriodPicker value={period} onChange={setPeriod} />
              </motion.div>
            </motion.div>

            {/* Agent Cards */}
            <AnimatePresence mode="wait">
              {agents.length > 0 ? (
                <AgentCardRow
                  key="cards"
                  agents={agents}
                  isEngineRunning={isEngineRunning}
                  runningConfigPath={runningConfigPath}
                  onRun={handleRun}
                  onStop={handleStop}
                  onLogs={handleLogs}
                />
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center py-16 text-sm text-[#48484a]"
                >
                  No agents in this workspace
                </motion.div>
              )}
            </AnimatePresence>

            {/* Timeline */}
            <TimelineGrid agents={agents} period={period} onBarClick={handleTimelineBarClick} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

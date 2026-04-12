import { motion, AnimatePresence } from 'motion/react'
import type { AgentViewModel, AgentStatus } from '../../lib/agent-utils'

interface AgentCardProps {
  agent: AgentViewModel
  isEngineRunning: boolean
  runningConfigPath: string | null
  onRun: (configPath: string) => void
  onStop: () => void
  onLogs: (configPath: string) => void
  index: number
}

const statusConfig: Record<AgentStatus, { color: string; label: string }> = {
  running: { color: '#30d158', label: 'Running' },
  success: { color: '#30d158', label: 'Success' },
  failed: { color: '#ff453a', label: 'Failed' },
  stale: { color: '#86868b', label: 'Stale' },
  idle: { color: '#48484a', label: 'Idle' },
}

export function AgentCard({ agent, isEngineRunning, runningConfigPath, onRun, onStop, onLogs, index }: AgentCardProps) {
  const st = statusConfig[agent.status]
  const isThisRunning = runningConfigPath === agent.configPath
  const canRun = !isEngineRunning || isThisRunning
  const isFailed = agent.status === 'failed'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 24 }}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
      whileTap={{ scale: 0.98 }}
      className="flex-shrink-0 rounded-2xl p-5"
      style={{
        minWidth: 210,
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: `1px solid ${isFailed ? 'rgba(255,69,58,0.2)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {/* Avatar + name + status */}
      <div className="flex items-center gap-3 mb-4">
        <motion.div
          className="flex items-center justify-center text-white font-semibold"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: `linear-gradient(145deg, ${agent.gradient.from}, ${agent.gradient.to})`,
            boxShadow: `0 4px 12px ${agent.gradient.from}4d`,
            fontSize: 16,
          }}
          whileHover={{ scale: 1.08, rotate: 2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          {agent.initials}
        </motion.div>
        <div>
          <div className="text-[15px] font-semibold text-[#f5f5f7]" style={{ letterSpacing: '-0.2px' }}>
            {agent.name}
          </div>
          <div className="flex items-center gap-[5px] mt-[3px]">
            <motion.div
              animate={
                agent.status === 'running'
                  ? { opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }
                  : { opacity: 1, scale: 1 }
              }
              transition={
                agent.status === 'running'
                  ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
                  : {}
              }
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: st.color,
                boxShadow: agent.status === 'running' ? `0 0 8px ${st.color}` : undefined,
              }}
            />
            <motion.span
              key={agent.status}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs font-medium"
              style={{ color: st.color }}
            >
              {st.label}
            </motion.span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex justify-between text-xs text-[#86868b] mb-[14px]">
        <span>{agent.lastRunRelative || '—'}</span>
        <motion.span
          key={agent.successRate}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="font-medium"
          style={{ color: agent.successRate >= 80 ? '#30d158' : agent.successRate >= 50 ? '#ff9f0a' : '#ff453a' }}
        >
          {agent.runs.length > 0 ? `${agent.successRate}%` : '—'}
        </motion.span>
      </div>

      {/* Separator */}
      <div className="h-px mb-[14px]" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Actions */}
      <div className="flex gap-2">
        <AnimatePresence mode="wait">
          {isThisRunning ? (
            <motion.button
              key="stop"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="flex-1 text-center py-[7px] rounded-lg text-xs font-medium cursor-pointer"
              style={{ background: 'rgba(255,69,58,0.15)', color: '#ff453a' }}
              onClick={() => onStop()}
            >
              Stop
            </motion.button>
          ) : (
            <motion.button
              key="run"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={canRun ? { scale: 1.04 } : {}}
              whileTap={canRun ? { scale: 0.96 } : {}}
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
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="flex-1 text-center py-[7px] rounded-lg text-xs font-medium cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#86868b' }}
          onClick={() => onLogs(agent.configPath)}
        >
          Logs
        </motion.button>
      </div>
    </motion.div>
  )
}

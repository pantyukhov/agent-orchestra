import { motion, AnimatePresence } from 'motion/react'
import type { AgentViewModel } from '../../lib/agent-utils'
import type { RunRecord } from '../../types/state'
import type { Period } from './TimelinePeriodPicker'

interface TimelineGridProps {
  agents: AgentViewModel[]
  period: Period
  onBarClick?: (run: RunRecord) => void
}

interface TimeSlot {
  label: string
  start: Date
  end: Date
}

function getTimeSlots(period: Period): TimeSlot[] {
  const now = new Date()
  const slots: TimeSlot[] = []

  if (period === 'day') {
    for (let h = 0; h < 24; h++) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h)
      const end = new Date(start.getTime() + 3600000)
      slots.push({ label: `${h}`, start, end })
    }
  } else if (period === 'week') {
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
    monday.setHours(0, 0, 0, 0)

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    for (let d = 0; d < 7; d++) {
      const start = new Date(monday.getTime() + d * 86400000)
      const end = new Date(start.getTime() + 86400000)
      slots.push({ label: `${dayNames[d]} ${start.getDate()}`, start, end })
    }
  } else {
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - 28)
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))

    for (let w = 0; w < 5; w++) {
      const start = new Date(weekStart.getTime() + w * 7 * 86400000)
      const end = new Date(start.getTime() + 7 * 86400000)
      const label = `${start.getDate()}/${start.getMonth() + 1}`
      slots.push({ label, start, end })
    }
  }

  return slots
}

function getRunsInSlot(runs: RunRecord[], slot: TimeSlot): RunRecord[] {
  return runs.filter((r) => {
    const t = new Date(r.started_at)
    return t >= slot.start && t < slot.end
  })
}

const barColors: Record<string, string> = {
  success: '#30d158',
  failure: '#ff453a',
  running: '#0a84ff',
  canceled: '#48484a',
  stale: '#48484a',
}

function isToday(slot: TimeSlot): boolean {
  const now = new Date()
  return slot.start <= now && now < slot.end
}

export function TimelineGrid({ agents, period, onBarClick }: TimelineGridProps) {
  const slots = getTimeSlots(period)
  const colTemplate = `150px repeat(${slots.length}, 1fr)`

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4, ease: 'easeOut' }}
      className="px-8 pb-7"
    >
      <div
        className="text-xs font-semibold uppercase mb-[14px]"
        style={{ color: '#86868b', letterSpacing: '0.08em' }}
      >
        Activity
      </div>

      <motion.div
        layout
        className="rounded-[14px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Header row */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: colTemplate,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="p-3 px-4" />
          <AnimatePresence mode="popLayout">
            {slots.map((slot, i) => (
              <motion.div
                key={`${period}-${i}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ delay: i * 0.02, duration: 0.2 }}
                className="p-3 px-2 text-center text-[11px] font-medium"
                style={{
                  color: isToday(slot) ? '#f5f5f7' : '#48484a',
                  fontWeight: isToday(slot) ? 600 : 500,
                }}
              >
                {slot.label}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Agent rows */}
        {agents.map((agent, ai) => (
          <motion.div
            key={agent.configPath}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + ai * 0.05, type: 'spring', stiffness: 300, damping: 24 }}
            className="grid items-center"
            style={{
              gridTemplateColumns: colTemplate,
              borderBottom: ai < agents.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
            }}
          >
            {/* Agent label */}
            <div className="flex items-center gap-[10px] py-[14px] px-4">
              <div
                className="flex items-center justify-center text-white font-semibold"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: `linear-gradient(145deg, ${agent.gradient.from}, ${agent.gradient.to})`,
                  fontSize: 11,
                }}
              >
                {agent.initials}
              </div>
              <span className="text-[13px] font-medium text-[#f5f5f7]">{agent.name}</span>
            </div>

            {/* Time cells */}
            {slots.map((slot, si) => {
              const slotRuns = getRunsInSlot(agent.runs, slot)
              return (
                <div key={si} className="flex gap-[3px] justify-center py-2 px-[6px]">
                  {slotRuns.map((run, ri) => (
                    <motion.div
                      key={ri}
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={
                        run.status === 'running'
                          ? { scaleY: 1, opacity: [0.9, 0.4, 0.9] }
                          : { scaleY: 1, opacity: 0.9 }
                      }
                      transition={
                        run.status === 'running'
                          ? { scaleY: { delay: 0.4 + si * 0.03 + ri * 0.02 }, opacity: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } }
                          : { delay: 0.4 + si * 0.03 + ri * 0.02, type: 'spring', stiffness: 300, damping: 20 }
                      }
                      whileHover={onBarClick ? { scaleY: 1.3, scaleX: 1.5 } : {}}
                      style={{
                        width: 6,
                        height: 22,
                        borderRadius: 3,
                        background: barColors[run.status] ?? '#48484a',
                        cursor: onBarClick ? 'pointer' : undefined,
                        originY: 1,
                      }}
                      onClick={() => onBarClick?.(run)}
                    />
                  ))}
                </div>
              )
            })}
          </motion.div>
        ))}

        {/* Empty state */}
        {agents.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center py-12 text-sm text-[#48484a]"
          >
            No activity yet
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}

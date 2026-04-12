import { motion } from 'motion/react'

export type Period = 'day' | 'week' | 'month'

interface TimelinePeriodPickerProps {
  value: Period
  onChange: (period: Period) => void
}

const labels: Record<Period, string> = { day: 'Day', week: 'Week', month: 'Month' }

export function TimelinePeriodPicker({ value, onChange }: TimelinePeriodPickerProps) {
  return (
    <div
      className="relative flex rounded-lg p-[2px]"
      style={{ background: 'rgba(255,255,255,0.08)' }}
    >
      {(['day', 'week', 'month'] as Period[]).map((p) => (
        <button
          key={p}
          className="relative z-10 px-4 py-[6px] rounded-md text-[13px] font-medium"
          style={{ color: value === p ? '#f5f5f7' : '#86868b' }}
          onClick={() => onChange(p)}
        >
          {value === p && (
            <motion.div
              layoutId="period-pill"
              className="absolute inset-0 rounded-md"
              style={{ background: 'rgba(255,255,255,0.12)' }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative z-10">{labels[p]}</span>
        </button>
      ))}
    </div>
  )
}

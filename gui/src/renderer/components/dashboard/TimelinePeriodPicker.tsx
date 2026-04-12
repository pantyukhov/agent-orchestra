export type Period = 'day' | 'week' | 'month'

interface TimelinePeriodPickerProps {
  value: Period
  onChange: (period: Period) => void
}

const labels: Record<Period, string> = { day: 'Day', week: 'Week', month: 'Month' }

export function TimelinePeriodPicker({ value, onChange }: TimelinePeriodPickerProps) {
  return (
    <div
      className="flex rounded-lg p-[2px]"
      style={{ background: 'rgba(255,255,255,0.08)' }}
    >
      {(['day', 'week', 'month'] as Period[]).map((p) => (
        <button
          key={p}
          className="px-4 py-[6px] rounded-md text-[13px] font-medium transition-colors"
          style={{
            background: value === p ? 'rgba(255,255,255,0.12)' : 'transparent',
            color: value === p ? '#f5f5f7' : '#86868b',
          }}
          onClick={() => onChange(p)}
        >
          {labels[p]}
        </button>
      ))}
    </div>
  )
}

import { cn } from '@/lib/utils'
import { scoreColor, STAGE_LABELS, temperatureColor } from '@/lib/constants'
import type { LeadTemperature, PipelineStage } from '@/types'

const TEMP_LABEL: Record<LeadTemperature, string> = {
  hot: 'HOT',
  warm: 'WARM',
  cold: 'COLD',
}

/** Circular score gauge used in the lead detail header. */
export function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const color = scoreColor(score)
  const stroke = 4
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold tabular-nums"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  )
}

/** Small temperature indicator dot, optionally with a text label. */
export function TemperatureDot({
  temperature,
  withLabel = false,
  className,
}: {
  temperature: LeadTemperature
  withLabel?: boolean
  className?: string
}) {
  const color = temperatureColor(temperature)
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {withLabel && (
        <span className="text-[10px] font-semibold tracking-wide" style={{ color }}>
          {TEMP_LABEL[temperature]}
        </span>
      )}
    </span>
  )
}

export function ScoreBadge({
  score,
  temperature,
  className,
}: {
  score: number
  temperature?: LeadTemperature
  className?: string
}) {
  const color = scoreColor(score)
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-xs font-semibold tabular-nums"
        style={{ color, backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)` }}
      >
        {score}
      </span>
      {temperature && (
        <span
          className="text-[10px] font-semibold tracking-wide"
          style={{ color }}
        >
          {TEMP_LABEL[temperature]}
        </span>
      )}
    </span>
  )
}

const STAGE_TONE: Record<PipelineStage, string> = {
  new_lead: 'var(--chart-1)',
  contact: 'var(--chart-1)',
  contacted: 'var(--chart-4)',
  interested: 'var(--warning)',
  appointment: 'var(--chart-3)',
  follow_up: 'var(--warning)',
  sale: 'var(--success)',
}

export function StageBadge({
  stage,
  className,
}: {
  stage: PipelineStage
  className?: string
}) {
  const color = STAGE_TONE[stage]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ color, backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)` }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {STAGE_LABELS[stage]}
    </span>
  )
}

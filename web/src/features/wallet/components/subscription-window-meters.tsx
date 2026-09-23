/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { useTranslation } from 'react-i18next'

import type { UserSubscriptionRecord } from '@/features/subscriptions/types'
import { cn } from '@/lib/utils'

interface SubscriptionWindowMetersProps {
  sub: UserSubscriptionRecord
  t?: (key: string) => string
}

// Signature element: cyan gradient sweep slides across the 5h bar to
// convey the rolling-window nature (not a daily reset). Uses
// motion-safe: variant so prefers-reduced-motion users see a static bar.
function SlidingOverlay({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 motion-safe:animate-[sliding-window-sweep_30s_linear_infinite]',
        className,
      )}
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, rgba(94, 227, 208, 0) 30%, rgba(94, 227, 208, 0.55) 50%, rgba(94, 227, 208, 0) 70%, transparent 100%)',
      }}
    />
  )
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

export function SubscriptionWindowMeters({
  sub,
  t: tProp,
}: SubscriptionWindowMetersProps) {
  const { t: tHook } = useTranslation()
  const t = tProp ?? tHook

  const limit5h = Number(sub.window_limit_5h ?? 0)
  const usage5h = Number(sub.window_usage_5h ?? 0)
  const limitWeekly = Number(sub.window_limit_weekly ?? 0)
  const usageWeekly = Number(sub.window_usage_weekly ?? 0)

  const pct5h = limit5h > 0 ? Math.min(100, (usage5h / limit5h) * 100) : 0
  const pctWeekly =
    limitWeekly > 0 ? Math.min(100, (usageWeekly / limitWeekly) * 100) : 0

  // Hide entirely if no window data is available (unlimited or unknown).
  if (limit5h <= 0 && limitWeekly <= 0) return null

  return (
    <div className="mt-3 space-y-3">
      {limit5h > 0 && (
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t('This 5 hours')}</span>
            <span className="tabular-nums text-foreground">
              {usage5h.toLocaleString()} / {limit5h.toLocaleString()}
            </span>
          </div>
          <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="absolute inset-y-0 left-0 bg-cyan-400 transition-[width] duration-500"
              style={{ width: pct5h + '%' }}
            />
            <SlidingOverlay />
          </div>
        </div>
      )}

      {limitWeekly > 0 && (
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t('This week')}</span>
            <span className="tabular-nums text-foreground">
              {formatNumber(usageWeekly)} / {formatNumber(limitWeekly)}
            </span>
          </div>
          <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="absolute inset-y-0 left-0 bg-cyan-400 transition-[width] duration-500"
              style={{ width: pctWeekly + '%' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

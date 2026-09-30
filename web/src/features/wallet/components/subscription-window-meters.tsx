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

import type { SelfSubscriptionData } from '@/features/subscriptions/types'
import { cn } from '@/lib/utils'

interface SubscriptionWindowMetersProps {
  data: SelfSubscriptionData
  t?: (key: string, opts?: Record<string, unknown>) => string
}

/**
 * MiniMax-style subscription usage meter: two progress bars (5h + weekly) with
 * a percentage and a human-readable reset countdown. Specific token / quota
 * numbers are intentionally NOT exposed to the end user; admins can read
 * exact values via the admin panel (Phase 2.3).
 *
 * Hides itself entirely when neither window has a configured limit.
 */
export function SubscriptionWindowMeters({
  data,
  t: tProp,
}: SubscriptionWindowMetersProps) {
  const { t: tHook } = useTranslation()
  const t = (tProp ?? tHook) as NonNullable<SubscriptionWindowMetersProps['t']>

  const limit5h = data.window_limit_5h ?? 0
  const usage5h = data.window_usage_5h ?? 0
  const reset5h = data.window_reset_5h_unix ?? 0
  const limitWeekly = data.window_limit_weekly ?? 0
  const usageWeekly = data.window_usage_weekly ?? 0
  const resetWeekly = data.window_reset_weekly_unix ?? 0

  const pct5h = limit5h > 0 ? Math.min(100, Math.round((usage5h / limit5h) * 100)) : 0
  const pctWeekly =
    limitWeekly > 0 ? Math.min(100, Math.round((usageWeekly / limitWeekly) * 100)) : 0

  // Hide entirely if no window has a configured limit.
  if (limit5h <= 0 && limitWeekly <= 0) return null

  return (
    <div className='mt-3 space-y-3'>
      {limit5h > 0 && (
        <WindowMeter
          title={t('window.5h.title')}
          percent={pct5h}
          resetUnix={reset5h}
          t={t}
          accentClass='bg-emerald-400'
        />
      )}
      {limitWeekly > 0 && (
        <WindowMeter
          title={t('window.weekly.title')}
          percent={pctWeekly}
          resetUnix={resetWeekly}
          t={t}
          accentClass='bg-orange-400'
        />
      )}
    </div>
  )
}

function WindowMeter({
  title,
  percent,
  resetUnix,
  t,
  accentClass,
}: {
  title: string
  percent: number
  resetUnix: number
  t: (key: string, opts?: Record<string, unknown>) => string
  accentClass: string
}) {
  return (
    <div>
      <div className='flex justify-between text-xs'>
        <span className='text-muted-foreground'>{title}</span>
        <span className='tabular-nums text-foreground'>
          {percent === 0 ? '<1%' : `${percent}%`}
        </span>
      </div>
      <div
        className='relative mt-1 h-2 overflow-hidden rounded-full bg-slate-200'
        role='progressbar'
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 transition-[width] duration-500',
            accentClass,
          )}
          style={{
            // Always show a minimum 4px width when the meter is rendered
            // and the user has any positive (or zero) usage to indicate that
            // the meter exists. Once percent >= 1 the real percentage wins.
            width:
              percent < 1 ? '4px' : `${percent}%`,
          }}
        />
      </div>
      <div className='mt-1 text-xs text-muted-foreground'>
        {formatResetCountdown(resetUnix, t)}
      </div>
    </div>
  )
}

/**
 * Render the Redis TTL as a human-readable countdown. Buckets are picked so
 * the largest unit dominates (no "1 day 23 hours 59 minutes 59 seconds").
 */
function formatResetCountdown(
  resetUnix: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!resetUnix || resetUnix <= 0) {
    // No active TTL means the window has never been used yet — show a static hint.
    return t('window.noUsage')
  }
  const nowSec = Math.floor(Date.now() / 1000)
  const secondsLeft = resetUnix - nowSec
  if (secondsLeft <= 0) {
    return t('window.resettingNow')
  }

  const days = Math.floor(secondsLeft / 86400)
  const hours = Math.floor((secondsLeft % 86400) / 3600)
  const minutes = Math.floor((secondsLeft % 3600) / 60)
  const onlyMinutes = Math.ceil(secondsLeft / 60)

  if (days >= 1) {
    return t('window.resetIn.dhm', { days, hours, minutes })
  }
  if (hours >= 1) {
    return t('window.resetIn.hm', { hours, minutes })
  }
  return t('window.resetIn.m', { minutes: onlyMinutes })
}
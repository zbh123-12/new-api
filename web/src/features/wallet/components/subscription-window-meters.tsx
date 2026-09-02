/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { TFunction } from 'i18next'

import type { UserSubscriptionRecord } from '@/features/subscriptions/types'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/**
 * MiniMax Token Plan style short-window request-count meters.
 * Renders one row per non-zero limit (5h, weekly). Hidden entirely when
 * neither limit is configured.
 */
export function SubscriptionWindowMeters({
  sub,
  t,
}: {
  sub: UserSubscriptionRecord
  t: TFunction
}) {
  const fmt = (n: number) => n.toLocaleString()

  const renderRow = (
    label: string,
    used: number,
    limit: number,
    limitLabel: string
  ) => {
    if (limit <= 0) return null
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
    const over = used > limit
    return (
      <div className='text-muted-foreground mt-1'>
        <div className='flex items-center justify-between gap-2'>
          <span>
            {label}: <span className={cn('font-medium', over && 'text-red-500')}>{fmt(used)}</span>
NaN          </span>
          <span className={cn(over && 'text-red-500')}>{pct}%</span>
        </div>
        <Progress
          value={pct}
          className={cn('mt-1 h-1.5', over && 'bg-red-200 dark:bg-red-950')}
        />
      </div>
    )
  }

  const has5h = Number(sub.window_limit_5h || 0) > 0
  const hasWeekly = Number(sub.window_limit_weekly || 0) > 0
  if (!has5h && !hasWeekly) return null

  return (
    <div className='mt-2 border-t pt-2'>
      {has5h
        ? renderRow(
            t('5-Hour Window Calls'),
            Number(sub.window_usage_5h || 0),
            Number(sub.window_limit_5h || 0),
            t('calls / 5h')
          )
        : null}
      {hasWeekly
        ? renderRow(
            t('Weekly Window Calls'),
            Number(sub.window_usage_weekly || 0),
            Number(sub.window_limit_weekly || 0),
            t('calls / 7d')
          )
        : null}
    </div>
  )
}

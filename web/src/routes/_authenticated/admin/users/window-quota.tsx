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
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getUserSubscriptionSelfAdmin } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'
import type { SelfSubscriptionData } from '@/features/subscriptions/types'

type WindowUsageData = SelfSubscriptionData

const searchSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
})

export const Route = createFileRoute(
  '/_authenticated/admin/users/window-quota',
)({
  validateSearch: searchSchema,
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: AdminWindowQuotaPage,
})

function AdminWindowQuotaPage() {
  const { userId: routeUserId } = Route.useSearch()
  const { t } = useTranslation()

  // Admin picks a userId from the search bar (or via a future deep-link).
  const [inputUserId, setInputUserId] = useState<string>(
    routeUserId ? String(routeUserId) : '',
  )
  const userId = Number(inputUserId)

  const enabled = Number.isFinite(userId) && userId > 0

  const response = useQuery({
    queryKey: ['admin', 'user-window-quota', userId],
    queryFn: () => getUserSubscriptionSelfAdmin(userId),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  })
  const data = response.data?.data as SelfSubscriptionData | undefined
  const isLoading = response.isLoading
  const isError = response.isError
  const error = response.error
  const refetch = response.refetch
  const isFetching = response.isFetching

  return (
    <div className='mx-auto flex max-w-3xl flex-col gap-6 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('Subscription window quota')}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {t('Inspect live Redis-backed window quota counters for any user.')}
          </p>
        </div>
        <Button variant='outline' onClick={() => window.history.back()}>
          <ArrowLeft className='mr-1 h-4 w-4' />
          {t('Back')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('Lookup user')}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-wrap items-center gap-3'>
          <label className='text-sm font-medium' htmlFor='admin-window-quota-userid'>
            {t('User ID')}
          </label>
          <input
            id='admin-window-quota-userid'
            type='number'
            min={1}
            inputMode='numeric'
            value={inputUserId}
            onChange={(e) => setInputUserId(e.target.value)}
            placeholder='23'
            className='border-input bg-background w-32 rounded-md border px-3 py-1 text-sm'
          />
          <Button
            type='button'
            onClick={() => refetch()}
            disabled={!enabled || isFetching}
          >
            <RefreshCw
              className={isFetching ? 'mr-1 h-4 w-4 animate-spin' : 'mr-1 h-4 w-4'}
            />
            {t('Refresh')}
          </Button>
        </CardContent>
      </Card>

      {enabled ? (
        isLoading ? (
          <Card>
            <CardContent className='p-10 text-center text-muted-foreground'>
              {t('Loading...')}
            </CardContent>
          </Card>
        ) : isError ? (
          <Card>
            <CardContent className='p-10 text-center text-destructive'>
              {(error as Error)?.message ?? t('Failed to load')}
            </CardContent>
          </Card>
        ) : data ? (
          <AdminWindowQuotaContent data={data} />
        ) : null
      ) : (
        <Card>
          <CardContent className='p-10 text-center text-muted-foreground text-sm'>
            {t('Enter a user id to view quota.')}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AdminWindowQuotaContent({ data }: { data: WindowUsageData }) {
  const { t } = useTranslation()
  const limit5h = data.window_limit_5h ?? 0
  const usage5h = data.window_usage_5h ?? 0
  const reset5h = data.window_reset_5h_unix ?? 0
  const limitWeekly = data.window_limit_weekly ?? 0
  const usageWeekly = data.window_usage_weekly ?? 0
  const resetWeekly = data.window_reset_weekly_unix ?? 0

  const has5h = limit5h > 0
  const hasWeekly = limitWeekly > 0

  return (
    <div className='space-y-4'>
      <WindowQuotaCard
        title={t('5h window')}
        limit={limit5h}
        usage={usage5h}
        resetUnix={reset5h}
        unlimitedFallback={t('Unlimited (no limit set)')}
        noUsageFallback={t('No usage yet')}
      />
      <WindowQuotaCard
        title={t('Weekly window')}
        limit={limitWeekly}
        usage={usageWeekly}
        resetUnix={resetWeekly}
        unlimitedFallback={t('Unlimited (no limit set)')}
        noUsageFallback={t('No usage yet')}
      />

      {!has5h && !hasWeekly && (
        <Card>
          <CardContent className='p-6 text-center text-muted-foreground text-sm'>
            {t('This user has no window quota configured on their active plan.')}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('Subscription summary')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-1 text-sm'>
          <Row label={t('Billing preference')} value={data.billing_preference ?? '-'} />
          <Row
            label={t('Active subscriptions')}
            value={String(data.subscriptions?.length ?? 0)}
          />
          <Row
            label={t('All subscriptions')}
            value={String(data.all_subscriptions?.length ?? 0)}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function WindowQuotaCard({
  title,
  limit,
  usage,
  resetUnix,
  unlimitedFallback,
  noUsageFallback,
}: {
  title: string
  limit: number
  usage: number
  resetUnix: number
  unlimitedFallback: string
  noUsageFallback: string
}) {
  const { t } = useTranslation()

  if (limit <= 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{title}</CardTitle>
        </CardHeader>
        <CardContent className='text-muted-foreground text-sm'>
          {unlimitedFallback}
        </CardContent>
      </Card>
    )
  }

  const pct = Math.min(100, Math.round((usage / limit) * 1000) / 10)
  const resetText = formatResetText(resetUnix, t)

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between text-base'>
          <span>{title}</span>
          <span className='text-muted-foreground text-sm font-normal'>
            {formatBigInt(usage)} / {formatBigInt(limit)} ({pct}%)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-2'>
        <div
          className='bg-secondary h-2 w-full overflow-hidden rounded-full'
          role='progressbar'
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className='bg-primary h-full transition-[width]'
            style={{ width: pct + '%' }}
          />
        </div>
        <p className='text-muted-foreground text-xs'>
          {resetUnix > 0 ? resetText : noUsageFallback}
        </p>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-center justify-between'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='font-mono'>{value}</span>
    </div>
  )
}

function formatBigInt(n: number): string {
  return n.toLocaleString('en-US')
}

function formatResetText(
  resetUnix: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!resetUnix || resetUnix <= 0) {
    return t('window.noUsage')
  }
  const now = Math.floor(Date.now() / 1000)
  const secondsLeft = resetUnix - now
  if (secondsLeft <= 0) {
    return t('window.resettingNow')
  }
  const days = Math.floor(secondsLeft / 86400)
  const hours = Math.floor((secondsLeft % 86400) / 3600)
  const minutes = Math.floor((secondsLeft % 3600) / 60)
  if (days >= 1) {
    return t('window.resetIn.dhm', { days, hours, minutes })
  }
  if (hours >= 1) {
    return t('window.resetIn.hm', { hours, minutes })
  }
  return t('window.resetIn.m', { minutes: Math.ceil(secondsLeft / 60) })
}
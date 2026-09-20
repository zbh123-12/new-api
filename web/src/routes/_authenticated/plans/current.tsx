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

For commercial licensing, please contact support@quantumnous.com
*/
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Sparkles } from 'lucide-react'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

import { SubscriptionStatusCard } from '@/features/subscriptions/components/subscription-status-card'
import type { UserSubscriptionRecord } from '@/features/subscriptions/types'

export const Route = createFileRoute('/_authenticated/plans/current')({
  component: CurrentPlanPage,
})

function CurrentPlanPage() {
  const { t } = useTranslation()
  const [selfSub, setSelfSub] = useState<UserSubscriptionRecord | null>(null)
  const [loading, setLoading] = useState(true)

  // Self-sub fetch with retry. After purchase, the backend may need a brief moment
  // to commit the new subscription row, so a single fetch can race and return empty.
  // Retry up to 3 times with a 1s gap before falling back to the empty state.
  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const tryFetch = async () => {
      while (attempts < 3 && !cancelled) {
        try {
          const r = await fetch('/api/subscription/self', { credentials: 'include' })
          if (cancelled) return
          if (r.ok) {
            const d = await r.json()
            // Prefer active subscription; fall back to most-recent historical one
            // so the page is never completely empty for returning users.
            const active = d?.data?.subscriptions
            const all = d?.data?.all_subscriptions
            const pick =
              Array.isArray(active) && active.length > 0
                ? active[0]
                : Array.isArray(all) && all.length > 0
                  ? all[0]
                  : null
            if (pick) {
              setSelfSub(pick)
              setLoading(false)
              return
            }
          }
        } catch {
          // silent — retry
        }
        attempts++
        if (attempts < 3 && !cancelled) {
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
      if (!cancelled) setLoading(false)
    }
    void tryFetch()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Subscription Usage')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <Link
            to="/plans"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('Back to plans')}
          </Link>

          {loading ? (
            <div className="bg-card text-muted-foreground rounded-xl border p-10 text-center text-sm">
              {t('Loading...')}
            </div>
          ) : selfSub ? (
            <SubscriptionStatusCard sub={selfSub} />
          ) : (
            <div className="bg-card space-y-6 rounded-xl border p-8 text-center sm:p-12">
              <div className="mx-auto max-w-md space-y-3">
                <div className="bg-muted mx-auto flex h-12 w-12 items-center justify-center rounded-full">
                  <Sparkles className="text-muted-foreground h-6 w-6" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {t('No active subscription yet')}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t(
                    'Pick a subscription tier to unlock higher request limits, dedicated model access, and priority support. Cancel anytime.',
                  )}
                </p>
              </div>

              <div className="mx-auto grid max-w-2xl gap-3 pt-2 text-left sm:grid-cols-3">
                <div className="bg-muted/40 rounded-lg p-4">
                  <div className="text-foreground text-2xl font-bold">¥49</div>
                  <div className="text-muted-foreground text-xs">{t('Plus · per month')}</div>
                </div>
                <div className="bg-muted/40 rounded-lg p-4">
                  <div className="text-foreground text-2xl font-bold">¥119</div>
                  <div className="text-muted-foreground text-xs">{t('Max · per month')}</div>
                </div>
                <div className="bg-muted/40 rounded-lg p-4">
                  <div className="text-foreground text-2xl font-bold">¥469</div>
                  <div className="text-muted-foreground text-xs">{t('Ultra · per month')}</div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 pt-2">
                <Button render={<Link to="/plans" />} size="lg">
                  {t('Browse plans')}
                </Button>
                <Link
                  to="/plans"
                  className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                >
                  {t('Compare all features →')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

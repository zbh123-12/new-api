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
import { ArrowLeft } from 'lucide-react'

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
            const subs = d?.data?.subscriptions
            if (Array.isArray(subs) && subs.length > 0) {
              setSelfSub(subs[0])
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
          ) : selfSub?.subscription ? (
            <SubscriptionStatusCard sub={selfSub} />
          ) : (
            <div className="bg-card rounded-xl border p-10 text-center">
              <p className="text-muted-foreground mb-4 text-sm">
                {t('You have no active subscription.')}
              </p>
              <Button render={<Link to="/plans" />}>{t('Browse plans')}</Button>
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

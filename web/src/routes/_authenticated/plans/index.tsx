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
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { useAuthStore } from '@/stores/auth-store'

import { SubscriptionPlansCard } from '@/features/wallet/components/subscription-plans-card'
import { SubscriptionWindowMeters } from '@/features/wallet/components/subscription-window-meters'

import { useTopupInfo } from '@/features/wallet/hooks/use-topup-info'
import type { UserSubscriptionRecord } from '@/features/subscriptions/types'

export const Route = createFileRoute('/_authenticated/plans/')({
  component: PlansPage,
})

function PlansPage() {
  const { t } = useTranslation()
  const authUser = useAuthStore((s) => s.auth.user)
  const { topupInfo } = useTopupInfo()
  const [selfSub, setSelfSub] = useState<UserSubscriptionRecord | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r2 = await fetch('/api/subscription/self', { credentials: 'include' })
        if (cancelled || !r2.ok) return
        const d2 = await r2.json()
        // /api/subscription/self returns { billing_preference, subscriptions: [...], all_subscriptions: [...] }.
        // Take the first active subscription record.
        const subs = d2?.data?.subscriptions
        setSelfSub(Array.isArray(subs) && subs.length > 0 ? subs[0] : null)
      } catch {
        // Silent: section just won't render.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [authUser?.id, refreshKey])

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Subscription Plans')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          {/* Always-visible: link to subscription details / history.
              Visible regardless of whether the user has an active subscription,
              so users without one still find the page and see the empty-state CTA. */}
          <div className="flex items-center justify-end">
            <Link
              to="/plans/current"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
            >
              {selfSub?.subscription
                ? t('View usage details')
                : t('View my subscription')}
              {' →'}
            </Link>
          </div>
          {selfSub?.subscription && (
            <div className="rounded-xl border border-primary/30 bg-muted/30 p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t('Your current subscription')}
              </div>
              <div className="mt-1 text-lg font-semibold">
                {selfSub.plan?.title || 'Plan #' + selfSub.subscription.plan_id}
              </div>
              <SubscriptionWindowMeters sub={selfSub} t={t} />
            </div>
          )}
          <SubscriptionPlansCard
            key={refreshKey}
            topupInfo={topupInfo}
            userQuota={authUser?.quota}
            currentSubscription={selfSub}
            onPurchaseSuccess={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

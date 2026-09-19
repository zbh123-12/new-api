/* Copyright (C) 2023-2026 QuantumNous
 * ... (license) ...
 */
import { createFileRoute } from '@tanstack/react-router'
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
        if (!cancelled && r2.ok) {
          const d2 = await r2.json()
          setSelfSub(d2?.data || null)
        }
      } catch {}
    }
    void load()
    return () => { cancelled = true }
  }, [authUser?.id, refreshKey])

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Subscription Plans')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Simple, transparent pricing that scales with you')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-6'>
          {selfSub?.subscription && (
            <div className='bg-muted/30 border-primary/30 rounded-xl border p-4'>
              <div className='text-muted-foreground text-xs uppercase tracking-wider'>{t('Your current subscription')}</div>
              <div className='mt-1 text-lg font-semibold'>{selfSub.plan?.title || `Plan #${selfSub.subscription.plan_id}`}</div>
              <div className='text-muted-foreground mt-1 text-sm'>
                {t('Remaining')} {((Number(selfSub.subscription.amount_total || 0) - Number(selfSub.subscription.amount_used || 0)) / 500000).toFixed(2)} CNY
              </div>
              <SubscriptionWindowMeters sub={selfSub} t={t} />
            </div>
          )}
          <SubscriptionPlansCard
            key={refreshKey}
            topupInfo={topupInfo}
            userQuota={authUser?.quota}
            onPurchaseSuccess={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
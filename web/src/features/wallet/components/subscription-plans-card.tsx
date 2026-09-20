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
import { Check, Sparkles } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { SubscriptionPurchaseDialog } from '@/features/subscriptions/components/dialogs/subscription-purchase-dialog'
import type { PlanRecord, UserSubscriptionRecord } from '@/features/subscriptions/types'
import { cn } from '@/lib/utils'

import type { PaymentMethod, TopupInfo } from '../types'

type BillingCycle = 'monthly' | 'yearly'

interface SubscriptionPlansCardProps {
  topupInfo: TopupInfo | null
  onAvailabilityChange?: (available: boolean) => void
  userQuota?: number
  onPurchaseSuccess?: () => void | Promise<void>
  currentSubscription?: UserSubscriptionRecord | null
}

function getEpayMethods(payMethods: PaymentMethod[] = []): PaymentMethod[] {
  return payMethods.filter(
    (m) => m?.type && m.type !== 'stripe' && m.type !== 'creem',
  )
}

// Tier presentation metadata. Match by DB-stored plan.title.
// Keys reference three i18n entries: {prefix}TierTagline and {prefix}TierDescription.
// popular/flagship drive visual weight (Max = warm/raised, Ultra = dark/inverted).
interface TierMeta {
  taglineKey: string
  // Three short benefit bullets, layered under the tagline for visual hierarchy.
  featureKeys: [string, string, string]
  // Small token-equivalent hint at the bottom of the feature list.
  tokenEquivalentKey: string
  popular: boolean
  flagship: boolean
}

const TIER_META: Record<string, TierMeta> = {
  Plus: {
    taglineKey: 'plus.tier_tagline',
    featureKeys: [
      'plus.feature.scenario',
      'plus.feature.scale',
      'plus.feature.included',
    ],
    tokenEquivalentKey: 'plus.token_equivalent',
    popular: false,
    flagship: false,
  },
  Max: {
    taglineKey: 'max.tier_tagline',
    featureKeys: [
      'max.feature.scenario',
      'max.feature.scale',
      'max.feature.included',
    ],
    tokenEquivalentKey: 'max.token_equivalent',
    popular: true,
    flagship: false,
  },
  Ultra: {
    taglineKey: 'ultra.tier_tagline',
    featureKeys: [
      'ultra.feature.scenario',
      'ultra.feature.scale',
      'ultra.feature.included',
    ],
    tokenEquivalentKey: 'ultra.token_equivalent',
    popular: false,
    flagship: true,
  },
}

function getTierMeta(planTitle: string): TierMeta {
  // Fallback: a generic cheap-tier presentation. Admins should keep plan.title aligned
  // with the canonical Plus/Max/Ultra set; anything else gets a neutral card.
  return (
    TIER_META[planTitle] ?? {
      taglineKey: 'plus.tier_tagline',
      featureKeys: [
        'plus.feature.scenario',
        'plus.feature.scale',
        'plus.feature.included',
      ],
      tokenEquivalentKey: 'plus.token_equivalent',
      popular: false,
      flagship: false,
    }
  )
}

// FAQ: only generic questions. Limit-mechanic questions live on /plans/details.
const FAQ_ITEMS: Array<{ qKey: string; aKey: string }> = [
  { qKey: 'Can I change plans later?', aKey: 'Yes, upgrade or downgrade anytime. Already-used quota is prorated based on the remaining billing period.' },
  { qKey: 'What happens when my quota runs out?', aKey: 'You can keep using the API, but overage is billed from your wallet balance at upstream rates. When the wallet is empty, the API returns 429.' },
  { qKey: 'Can I use my subscription together with wallet balance?', aKey: 'Yes. Subscription quota is consumed first; overage automatically falls back to wallet balance at standard rates.' },
]

const EVERY_PLAN_FEATURES: string[] = [
  'everyPlan.flawlessAccess',
  'everyPlan.transparentUsage',
  'everyPlan.peakAvailable',
  'everyPlan.smartRate',
  'everyPlan.flexiblePause',
  'everyPlan.noHiddenFees',
]

export function SubscriptionPlansCard({
  topupInfo,
  onAvailabilityChange,
  userQuota,
  onPurchaseSuccess,
  currentSubscription,
}: SubscriptionPlansCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [plans, setPlans] = useState<PlanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDialogPlan, setActiveDialogPlan] = useState<PlanRecord | null>(null)

  const epayMethods = useMemo(() => getEpayMethods(topupInfo?.pay_methods), [topupInfo])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/subscription/plans', { credentials: 'include' })
      const d = await res.json()
      if (res.ok && d?.success && Array.isArray(d?.data)) {
        setPlans(d.data as PlanRecord[])
        onAvailabilityChange?.(d.data.length > 0)
      } else {
        setPlans([])
        onAvailabilityChange?.(false)
      }
    } catch {
      setPlans([])
      onAvailabilityChange?.(false)
    } finally {
      setLoading(false)
    }
  }, [onAvailabilityChange])

  useEffect(() => {
    void load()
  }, [load])

  const buyPlan = useCallback(
    (plan: PlanRecord) => {
      if (!epayMethods.length) {
        toast.error(t('Payment not configured'))
        return
      }
      setActiveDialogPlan(plan)
    },
    [epayMethods, t],
  )

  const onPurchaseDialogClose = useCallback((open: boolean) => {
    if (!open) setActiveDialogPlan(null)
  }, [])

  const goToPricingDetails = useCallback(() => {
    navigate({ to: '/plans/details' })
  }, [navigate])

  if (loading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <TitledCard
      title={t('Subscription Plans')}
      description={t('Simple, transparent pricing that scales with you')}
    >
      {/* Billing cycle toggle */}
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-lg bg-muted p-1">
          <button
            type='button'
            onClick={() => setCycle('monthly')}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              cycle === 'monthly'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('Monthly')}
          </button>
          <button
            type='button'
            onClick={() => setCycle('yearly')}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              cycle === 'yearly'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('Yearly')}
            <span className='ml-2 text-xs text-accent-max'>{t('save 16%')}</span>
          </button>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {plans.map((p) => {
          const tier = getTierMeta(p.plan.title)
          const isPopular = tier.popular
          const isFlagship = tier.flagship
          const monthlyPrice = Number(p.plan.price_amount) || 0
          // 16% discount -> 10/12 of monthly. Rounded to int for display.
          const yearlyPrice = Math.round(monthlyPrice * 10)
          const price = cycle === 'yearly' ? yearlyPrice : monthlyPrice
          const perUnit = cycle === 'yearly' ? t('per year') : t('per month')
          // Decide purchase button state relative to the user's current subscription.
          // Backend guard will reject duplicate-tier purchases; we mirror that here.
          const currentPlan = currentSubscription?.plan
          const currentPrice = currentPlan ? Number(currentPlan.price_amount) : 0
          const isSameTier = !!currentPlan && currentPlan.id === p.plan.id
          const isHigherTier = currentPrice > 0 && monthlyPrice > currentPrice
          const isCurrentTop =
            !!currentPlan &&
            !plans.some((q) => Number(q.plan.price_amount) > currentPrice)
          const buyLabel = !currentPlan
            ? t('Choose') + ' ' + p.plan.title
            : isSameTier
              ? t('Already subscribed')
              : isHigherTier
                ? t('Upgrade to {{tier}}', { tier: p.plan.title })
                : isCurrentTop
                  ? t('Already at top tier')
                  : t('Downgrade to {{tier}}', { tier: p.plan.title })
          const buyDisabled = isSameTier || isCurrentTop

          return (
            <div key={p.plan.id}
              className={cn(
                'relative flex flex-col rounded-xl border p-6 transition-shadow',
                !isPopular && !isFlagship && 'border-slate-200 bg-slate-50',
                isPopular && 'border-amber-300 bg-amber-50 shadow-md shadow-amber-500/10',
                isFlagship && 'border-slate-800 bg-slate-900 text-slate-100',
              )}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-amber-500 text-white px-3 py-1 shadow-md">
                    <Sparkles className="mr-1 h-3 w-3" />
                    {t('Most loved')}
                  </Badge>
                </div>
              )}

              <h3 className={cn('text-xl font-bold tracking-tight', isFlagship && 'text-white')}>
                {p.plan.title}
              </h3>

              <p className={cn('mt-2 text-sm font-medium', isFlagship ? 'text-amber-300' : 'text-slate-700')}>
                {t(tier.taglineKey)}
              </p>

              <ul className={cn('mt-3 space-y-1.5 text-sm', isFlagship ? 'text-slate-200' : 'text-slate-700')}>
                {tier.featureKeys.map((featureKey) => (
                  <li key={featureKey} className="flex items-start gap-2">
                    <Check
                      className={cn(
                        'mt-0.5 h-3.5 w-3.5 flex-none',
                        isFlagship ? 'text-amber-300' : 'text-emerald-600',
                      )}
                      strokeWidth={3}
                    />
                    <span className="leading-relaxed">{t(featureKey)}</span>
                  </li>
                ))}
              </ul>

              <p className={cn('mt-3 text-xs', isFlagship ? 'text-slate-400' : 'text-slate-500')}>
                {t(tier.tokenEquivalentKey)}
              </p>

              <Separator className={cn('my-5', isFlagship && 'bg-slate-700')} />

              <div className="flex items-baseline">
                <span className={cn('text-4xl font-extrabold tracking-tight tabular-nums', isFlagship && 'text-white')}>
                  {'¥' + price.toLocaleString('zh-CN')}
                </span>
                <span className={cn('ml-1 text-sm', isFlagship ? 'text-slate-300' : 'text-slate-500')}>
                  {perUnit}
                </span>
              </div>

              <div className="mt-6 flex-1" />

              <Button
                size='lg'
                variant={isPopular ? 'default' : isFlagship ? 'secondary' : 'outline'}
                className={cn(
                  'w-full',
                  isFlagship && 'bg-white text-slate-900 hover:bg-slate-100',
                )}
                onClick={() => buyPlan(p)}
                disabled={!epayMethods.length || buyDisabled}
              >
                {epayMethods.length ? buyLabel : t('Payment not configured')}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Every plan includes */}
      <div className="mt-12 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold tracking-tight">
          {t('Every plan includes')}
        </h3>
        <ul className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          {EVERY_PLAN_FEATURES.map((featureKey) => (
            <li key={featureKey} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" strokeWidth={3} />
              <span className="text-slate-700">{t(featureKey)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* See pricing details link */}
      <div className="mt-6 text-center">
        <button
          type='button'
          onClick={goToPricingDetails}
          className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {t('See pricing details')}
          {' →'}
        </button>
      </div>

      {/* FAQ */}
      <div className="mt-12">
        <h3 className="text-center text-xl font-bold tracking-tight">
          {t('Frequently asked questions')}
        </h3>
        <Accordion className="mx-auto mt-6 max-w-2xl">
          {FAQ_ITEMS.map((f, i) => (
            <AccordionItem key={i} value={'faq-' + i}>
              <AccordionTrigger className="text-left text-sm">
                {t(f.qKey)}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                {t(f.aKey)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {activeDialogPlan && (
        <SubscriptionPurchaseDialog
          open={!!activeDialogPlan}
          onOpenChange={onPurchaseDialogClose}
          plan={activeDialogPlan}
          currentSubscription={currentSubscription ?? null}
          epayMethods={epayMethods}
          userQuota={userQuota}
          onPurchaseSuccess={onPurchaseSuccess}
        />
      )}
    </TitledCard>
  )
}

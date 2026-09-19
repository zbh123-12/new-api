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

import { Check, Sparkles, ChevronDown, MessageCircle } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { SubscriptionPurchaseDialog } from '@/features/subscriptions/components/dialogs/subscription-purchase-dialog'
import { formatDuration, formatResetPeriod } from '@/features/subscriptions/lib'
import type {
  PlanRecord,
  UserSubscriptionRecord,
} from '@/features/subscriptions/types'
import { formatRawTokensWithUnit } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { PaymentMethod, TopupInfo } from '../types'

type BillingCycle = 'monthly' | 'yearly'

interface SubscriptionPlansCardProps {
  topupInfo: TopupInfo | null
  onAvailabilityChange?: (available: boolean) => void
  userQuota?: number
  onPurchaseSuccess?: () => void | Promise<void>
}

function getEpayMethods(payMethods: PaymentMethod[] = []): PaymentMethod[] {
  return payMethods.filter(
    (m) => m?.type && m.type !== 'stripe' && m.type !== 'creem'
  )
}

// Plan feature config (key: textKey used as t() key, fallback shown if missing)
const PLAN_FEATURES = [
  // Basic
  [
    { textKey: 'for light personal use', label: 'for light personal use' },
    { textKey: '5M token equivalent', label: '5M token / month' },
    { textKey: '5h window limit', label: '1500 calls / 5h' },
    { textKey: 'weekly window limit', label: '15,000 calls / week' },
    { textKey: 'email support', label: 'email support' },
  ],
  // Pro (Most Popular)
  [
    { textKey: 'for regular daily work', label: 'for regular daily work' },
    { textKey: '15M token equivalent', label: '15M token / month' },
    { textKey: '5h window limit', label: '4,500 calls / 5h' },
    { textKey: 'weekly window limit', label: '45,000 calls / week' },
    { textKey: 'priority support', label: 'priority support' },
  ],
  // Flagship
  [
    { textKey: 'for power users and teams', label: 'for power users and teams' },
    { textKey: '50M token equivalent', label: '50M token / month' },
    { textKey: 'all models including highspeed', label: 'all models (incl. highspeed)' },
    { textKey: '5h window limit', label: '15,000 calls / 5h' },
    { textKey: 'weekly window limit', label: '150,000 calls / week' },
    { textKey: 'priority queue', label: 'priority queue' },
  ],
];

const FAQ_ITEMS = [
  { qKey: 'Can I change plans later?', aKey: 'Yes, you can upgrade or downgrade at any time. Quota usage is prorated based on the time remaining in your billing period.' },
  { qKey: 'What happens when my quota runs out?', aKey: 'You can keep using the API, but requests will be charged against your wallet balance. If both are exhausted, the API will return a 429 error.' },
  { qKey: 'Do unused credits roll over?', aKey: 'No. Subscription quota resets each billing period. Quota does not accumulate.' },
  { qKey: 'Is there a free trial?', aKey: 'Not yet, but you can use the system in self-use mode. Pay only for the upstream model usage.' },
];

export function SubscriptionPlansCard({
  topupInfo,
  onAvailabilityChange,
  userQuota,
  onPurchaseSuccess,
}: SubscriptionPlansCardProps) {
  const { t } = useTranslation()
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [plans, setPlans] = useState<PlanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selfSub, setSelfSub] = useState<UserSubscriptionRecord | null>(null)
  const [activeDialogPlan, setActiveDialogPlan] = useState<PlanRecord | null>(null)

  const epayMethods = useMemo(() => getEpayMethods(topupInfo?.pay_methods), [topupInfo])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/subscription/plans', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setPlans([...(data?.data || [])].sort((a, b) => Number(a.plan?.price_amount || 0) - Number(b.plan?.price_amount || 0)))
        onAvailabilityChange?.((data?.data || []).length > 0)
      }
    } catch (e) {
      console.error('Failed to load plans', e)
    } finally {
      setLoading(false)
    }
  }, [onAvailabilityChange])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    let cancelled = false
    const loadSelf = async () => {
      try {
        const res = await fetch('/api/subscription/self', { credentials: 'include' })
        if (!cancelled && res.ok) {
          const data = await res.json()
          setSelfSub(data?.data || null)
        }
      } catch {}
    }
    void loadSelf()
    return () => { cancelled = true }
  }, [])

  const buyPlan = (plan: PlanRecord) => setActiveDialogPlan(plan)

  const onPurchaseDialogClose = (open: boolean) => {
    if (!open) {
      setActiveDialogPlan(null)
      void load()
    }
  }

  const yearlyMultiplier = 12 * 0.8 // 20% off yearly
  const getYearlyPrice = (monthlyPrice: number) =>
    Math.round(monthlyPrice * yearlyMultiplier)

  if (loading) {
    return (
      <TitledCard title={t('Subscription Plans')} icon={<Sparkles className='h-4 w-4' />}>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-1/2' />
          <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            {[0, 1, 2].map((i) => <Skeleton key={i} className='h-80 w-full rounded-xl' />)}
          </div>
        </div>
      </TitledCard>
    )
  }

  if (plans.length === 0) {
    return (
      <TitledCard title={t('Subscription Plans')} icon={<Sparkles className='h-4 w-4' />}>
        <p className='text-muted-foreground text-sm'>{t('No plans available')}</p>
      </TitledCard>
    )
  }

  return (
    <TitledCard
      title={t('Subscription Plans')}
      description={t('Simple, transparent pricing')}
      icon={<Sparkles className='h-4 w-4' />}
      disableHoverEffect
    >
      {/* Header + monthly/yearly toggle */}
      <div className='flex flex-col items-center gap-3 sm:flex-row sm:justify-between'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            {t('Choose your plan')}
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('Simple, transparent pricing')}
          </p>
        </div>
        <div className='inline-flex items-center rounded-full border bg-muted/50 p-1 text-sm'>
          <button
            type='button'
            onClick={() => setCycle('monthly')}
            className={cn(
              'rounded-full px-4 py-1.5 transition-colors',
              cycle === 'monthly' ? 'bg-background text-foreground shadow' : 'text-muted-foreground'
            )}
          >
            {t('Monthly')}
          </button>
          <button
            type='button'
            onClick={() => setCycle('yearly')}
            className={cn(
              'rounded-full px-4 py-1.5 transition-colors',
              cycle === 'yearly' ? 'bg-background text-foreground shadow' : 'text-muted-foreground'
            )}
          >
            {t('Yearly')}
            <Badge variant='secondary' className='ml-2 text-xs'>
              {t('Save 20%')}
            </Badge>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className='mt-6 grid grid-cols-1 gap-5 md:grid-cols-3'>
        {plans.slice(0, 3).map((p, idx) => {
          const plan = p?.plan
          if (!plan) return null
          const monthlyPrice = Number(plan.price_amount || 0)
          const yearlyPrice = getYearlyPrice(monthlyPrice)
          const price = cycle === 'yearly' ? yearlyPrice : monthlyPrice
          const featureList = PLAN_FEATURES[idx] || PLAN_FEATURES[0]
          const visual = idx === 1
            ? { card: 'border-2 border-primary shadow-2xl shadow-primary/20', bg: 'bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5' }
            : idx === 2
            ? { card: 'border-2 border-slate-800 shadow-xl', bg: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 [&]:text-white' }
            : { card: 'border bg-card', bg: 'bg-card' }
          const isPopular = idx === 1
          const isFlagship = idx === 2

          return (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-2xl p-6 transition-all',
                visual.card,
                visual.bg
              )}
            >
              {isPopular && (
                <div className='absolute -top-3 left-1/2 -translate-x-1/2'>
                  <Badge className='bg-primary text-primary-foreground px-3 py-1 shadow-md'>
                    <Sparkles className='mr-1 h-3 w-3' />
                    {t('Most Popular')}
                  </Badge>
                </div>
              )}

              <div className='flex items-baseline justify-between'>
                <h3 className={cn('text-lg font-semibold', isFlagship && 'text-white')}>
                  {plan.title}
                </h3>
                {isFlagship && <Badge variant='secondary'>{t('Enterprise')}</Badge>}
              </div>

              {plan.subtitle && (
                <p className={cn('mt-1 text-sm', isFlagship ? 'text-slate-300' : 'text-muted-foreground')}>
                  {plan.subtitle}
                </p>
              )}

              <div className='mt-5'>
                <div className='flex items-baseline'>
                  <span className={cn('text-4xl font-extrabold tracking-tight', isFlagship && 'text-white')}>
                    {formatCurrencySymbol(price)}
                  </span>
                  <span className={cn('ml-1 text-sm', isFlagship ? 'text-slate-300' : 'text-muted-foreground')}>
                    {cycle === 'yearly' ? t('per year') : t('per month')}
                  </span>
                </div>
                {cycle === 'yearly' && monthlyPrice > 0 && (
                  <p className={cn('mt-1 text-xs', isFlagship ? 'text-slate-400' : 'text-muted-foreground')}>
                    {t('You save')}{' '}
                    {formatCurrencySymbol(monthlyPrice * 12 - yearlyPrice)}{' '}
                    {t('per year')}
                  </p>
                )}
              </div>

              <Separator className={cn('my-5', isFlagship && 'bg-slate-700')} />

              <div className='space-y-1 text-sm'>
                <p className={cn('mb-3 font-medium', isFlagship ? 'text-slate-200' : 'text-foreground')}>
                  {t('What you get')}:
                </p>
                <ul className='space-y-2.5'>
                  {featureList.map((f, fi) => (
                    <li key={fi} className='flex items-start gap-2.5'>
                      <span
                        className={cn(
                          'mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full',
                          isFlagship ? 'bg-primary/30 text-primary-foreground' : 'bg-primary/10 text-primary'
                        )}
                      >
                        <Check className='h-2.5 w-2.5' strokeWidth={3} />
                      </span>
                      <span className={cn(isFlagship ? 'text-slate-200' : 'text-foreground')}>
                        {t(f.textKey, f.label)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className='mt-6 flex-1' />

              <Button
                size='lg'
                variant={isPopular ? 'default' : isFlagship ? 'secondary' : 'outline'}
                className={cn(
                  'w-full',
                  isPopular && 'shadow-lg shadow-primary/30',
                  isFlagship && 'bg-white text-slate-900 hover:bg-slate-100'
                )}
                onClick={() => buyPlan(p)}
                disabled={!epayMethods.length}
              >
                {epayMethods.length ? t('Get started') : t('Payment not configured')}
              </Button>
            </div>
          )
        })}
      </div>

      {/* FAQ */}
      <div className='mt-12'>
        <h3 className='text-center text-xl font-bold tracking-tight'>
          {t('Frequently asked questions')}
        </h3>
        <Accordion type='single' collapsible className='mx-auto mt-6 max-w-2xl'>
          {FAQ_ITEMS.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className='text-left text-sm'>
                {t(f.qKey)}
              </AccordionTrigger>
              <AccordionContent className='text-muted-foreground text-sm'>
                {t(f.aKey)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Purchase dialog */}
      {activeDialogPlan && (
        <SubscriptionPurchaseDialog
          open={!!activeDialogPlan}
          onOpenChange={onPurchaseDialogClose}
          plan={activeDialogPlan}
          epayMethods={epayMethods}
          userQuota={userQuota}
          onPurchaseSuccess={onPurchaseSuccess}
        />
      )}
    </TitledCard>
  )
}

function formatCurrencySymbol(amount: number): string {
  if (!amount || amount <= 0) return '¥0'
  return '¥' + amount.toLocaleString('zh-CN')
}
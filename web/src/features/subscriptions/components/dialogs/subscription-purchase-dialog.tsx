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
import { Crown } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrencyFromUSD } from '@/lib/currency'

import {
  paySubscriptionStripe,
  paySubscriptionCreem,
  paySubscriptionEpay,
  paySubscriptionWaffoPancake,
  paySubscriptionBalance,
} from '../../api'
import type { PlanRecord, UserSubscriptionRecord } from '../../types'

interface PaymentMethod {
  type: string
  name?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PlanRecord | null
  currentSubscription?: UserSubscriptionRecord | null
  enableStripe?: boolean
  enableCreem?: boolean
  enableWaffoPancake?: boolean
  enableOnlineTopUp?: boolean
  epayMethods?: PaymentMethod[]
  purchaseLimit?: number
  purchaseCount?: number
  userQuota?: number
  onPurchaseSuccess?: () => void | Promise<void>
}

// 1 quota unit = 500000 (matches quota_per_unit CNY/USD default in new-api).
// Used to convert internal quota points back to CNY for the upgrade dialog.
const QUOTA_PER_UNIT = 500000

function formatYuan(amount: number): string {
  return '¥' + amount.toLocaleString('zh-CN', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return '-'
  const d = new Date(timestamp * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return yyyy + '-' + mm + '-' + dd
}

export function SubscriptionPurchaseDialog(props: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [paying, setPaying] = useState(false)
  const [selectedEpayMethod, setSelectedEpayMethod] = useState('')

  useEffect(() => {
    if (props.open && props.epayMethods && props.epayMethods.length > 0) {
      setSelectedEpayMethod(props.epayMethods[0].type)
    } else if (!props.open) {
      setSelectedEpayMethod('')
    }
  }, [props.open, props.epayMethods])

  const plan = props.plan?.plan
  if (!plan) return null

  const hasStripe = props.enableStripe && !!plan.stripe_price_id
  const hasCreem = props.enableCreem && !!plan.creem_product_id
  const hasWaffoPancake =
    props.enableWaffoPancake && !!plan.waffo_pancake_product_id
  const hasEpay =
    props.enableOnlineTopUp && (props.epayMethods || []).length > 0
  const hasAnyPayment = hasStripe || hasCreem || hasWaffoPancake || hasEpay

  const selectedEpayMethodLabel =
    (props.epayMethods || []).find((m) => m.type === selectedEpayMethod)
      ?.name ||
    selectedEpayMethod ||
    t('Select payment method')

  const currentSub = props.currentSubscription?.subscription
  const currentPlan = props.currentSubscription?.plan
  const isUpgrade = !!(currentSub && currentPlan && currentPlan.id !== plan.id)
  const isRenewal = !!(currentSub && currentPlan && currentPlan.id === plan.id)

  // Pricing math.
  const newPrice = Number(plan.price_amount || 0)
  const oldPrice = currentPlan ? Number(currentPlan.price_amount || 0) : 0
  const remainingValueCny =
    currentSub
      ? Math.max(
          0,
          (Number(currentSub.amount_total || 0) -
            Number(currentSub.amount_used || 0)) /
            QUOTA_PER_UNIT,
        )
      : 0
  const totalDue = Math.max(0, newPrice - remainingValueCny)

  const allowBalancePay = plan.allow_balance_pay !== false
  const userQuota = Math.max(0, Number(props.userQuota || 0))
  const insufficientBalance = userQuota < totalDue * QUOTA_PER_UNIT
  const limitReached =
    (props.purchaseLimit || 0) > 0 &&
    (props.purchaseCount || 0) >= (props.purchaseLimit || 0)

  const dialogTitle = isUpgrade
    ? t('Upgrade subscription')
    : isRenewal
      ? t('Renew subscription')
      : t('Subscribe to plan')

  const subtitle = t(
    'The new plan takes effect immediately. Subsequent billing will use the new plan price. You can cancel anytime.',
  )

  const handlePayStripe = async () => {
    setPaying(true)
    try {
      const res = await paySubscriptionStripe({ plan_id: plan.id })
      if (res.message === 'success' && res.data?.pay_link) {
        window.open(res.data.pay_link, '_blank')
        toast.success(t('Payment page opened'))
        props.onOpenChange(false)
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed'),
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  const handlePayCreem = async () => {
    setPaying(true)
    try {
      const res = await paySubscriptionCreem({ plan_id: plan.id })
      if (res.message === 'success' && res.data?.checkout_url) {
        window.open(res.data.checkout_url, '_blank')
        toast.success(t('Payment page opened'))
        props.onOpenChange(false)
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed'),
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  const handlePayWaffoPancake = async () => {
    setPaying(true)
    try {
      const res = await paySubscriptionWaffoPancake({ plan_id: plan.id })
      if (res.message === 'success' && res.data?.checkout_url) {
        toast.success(t('Redirecting to payment page...'))
        window.location.href = res.data.checkout_url
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed'),
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  const isSafari =
    typeof navigator !== 'undefined' &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

  const handlePayEpay = async () => {
    if (!selectedEpayMethod) {
      toast.error(t('Please select a payment method'))
      return
    }
    setPaying(true)
    try {
      const res = await paySubscriptionEpay({
        plan_id: plan.id,
        payment_method: selectedEpayMethod,
      })
      if (res.message === 'success' && res.url) {
        const form = document.createElement('form')
        form.action = res.url
        form.method = 'POST'
        if (!isSafari) {
          form.target = '_blank'
        }
        Object.entries(res.data || {}).forEach(([key, value]) => {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = key
          input.value = String(value)
          form.appendChild(input)
        })
        document.body.appendChild(form)
        form.submit()
        document.body.removeChild(form)
        toast.success(t('Payment initiated'))
        props.onOpenChange(false)
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed'),
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  const handlePayBalance = async () => {
    if (!allowBalancePay) {
      toast.error(t('This plan does not allow balance redemption'))
      return
    }
    setPaying(true)
    try {
      const res = await paySubscriptionBalance({ plan_id: plan.id })
      if (res.success) {
        toast.success(t('Subscription purchased successfully'))
        props.onOpenChange(false)
        void props.onPurchaseSuccess?.()
        navigate({ to: '/plans/current' })
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed'),
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        <>
          <Crown className="h-5 w-5" />
          {dialogTitle}
        </>
      }
      contentClassName="max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md"
      titleClassName="flex items-center gap-2"
      contentHeight="auto"
      bodyClassName="space-y-5"
    >
      <p className="text-muted-foreground -mt-2 text-sm leading-relaxed">
        {subtitle}
      </p>

      {/* Current plan expiry (only when upgrading / renewing) */}
      {currentSub && currentSub.end_time > 0 && (
        <div className="bg-muted/40 rounded-lg px-4 py-3 text-sm">
          <div className="text-muted-foreground text-xs">
            {t('Current plan valid until')}
          </div>
          <div className="mt-0.5 font-medium">
            {formatDate(currentSub.end_time)}
          </div>
        </div>
      )}

      {/* Plan comparison block */}
      <div className="divide-y rounded-lg border">
        {/* From row */}
        {currentPlan && (
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{t('From')}</span>
            <span className="truncate font-medium">{currentPlan.title}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatYuan(oldPrice)} / {t('month')}
            </span>
          </div>
        )}

        {/* To row */}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {currentPlan ? t('To') : t('Plan')}
          </span>
          <span className="truncate font-medium">{plan.title}</span>
          <span className="tabular-nums text-foreground font-medium">
            {formatYuan(newPrice)} / {t('month')}
          </span>
        </div>

        {/* Credit for remaining value (upgrade only) */}
        {isUpgrade && remainingValueCny > 0 && (
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {t('Current plan credit')}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {t('Prorated to remaining days')}
            </span>
            <span className="tabular-nums text-emerald-600">
              -{formatYuan(remainingValueCny)}
            </span>
          </div>
        )}
      </div>

      {/* Total due - large prominent */}
      <div className="space-y-1">
        <div className="text-muted-foreground text-xs">{t('Total due')}</div>
        <div className="text-foreground text-3xl font-bold tabular-nums">
          {formatYuan(totalDue)}
        </div>
      </div>

      {/* Payment methods */}
      {(allowBalancePay || hasAnyPayment) && (
        <div className="space-y-3 border-t pt-4">
          <div className="text-muted-foreground text-xs">
            {t('Payment method')}
          </div>

          {allowBalancePay && (
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={handlePayBalance}
              disabled={
                paying || limitReached || !allowBalancePay || insufficientBalance
              }
            >
              <span>{t('Pay with wallet balance')}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatCurrencyFromUSD(userQuota / QUOTA_PER_UNIT)}
              </span>
            </Button>
          )}

          {(hasStripe || hasCreem || hasWaffoPancake) && (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {hasStripe && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handlePayStripe}
                  disabled={paying || limitReached}
                >
                  Stripe
                </Button>
              )}
              {hasCreem && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handlePayCreem}
                  disabled={paying || limitReached}
                >
                  Creem
                </Button>
              )}
              {hasWaffoPancake && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handlePayWaffoPancake}
                  disabled={paying || limitReached}
                >
                  Waffo Pancake
                </Button>
              )}
            </div>
          )}

          {hasEpay && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Select
                items={[
                  ...(props.epayMethods || []).map((m) => ({
                    value: m.type,
                    label: m.name || m.type,
                  })),
                ]}
                value={selectedEpayMethod}
                onValueChange={(v) => v !== null && setSelectedEpayMethod(v)}
                disabled={limitReached}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue>{selectedEpayMethodLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {(props.epayMethods || []).map((m) => (
                      <SelectItem key={m.type} value={m.type}>
                        {m.name || m.type}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                onClick={handlePayEpay}
                disabled={paying || !selectedEpayMethod || limitReached}
              >
                {t('Pay')}
              </Button>
            </div>
          )}
        </div>
      )}

      {limitReached && (
        <div className="text-destructive text-xs">
          {t('Purchase limit reached')} ({props.purchaseCount}/
          {props.purchaseLimit})
        </div>
      )}

      {/* Footer: legal links */}
      <div className="text-muted-foreground flex justify-center gap-4 border-t pt-3 text-xs">
        <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          {t('Terms of Service')}
        </a>
        <a href="/legal/auto-renewal" target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          {t('Auto-renewal policy')}
        </a>
      </div>
    </Dialog>
  )
}

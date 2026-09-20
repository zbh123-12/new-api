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
import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Link } from '@tanstack/react-router'

import type { UserSubscriptionRecord } from '@/features/subscriptions/types'

import { AllowedModelsList } from './allowed-models-list'
import { SubscriptionWindowMeters } from '@/features/wallet/components/subscription-window-meters'

interface SubscriptionStatusCardProps {
  sub: UserSubscriptionRecord
}

function formatExpiryDate(endTime: number | undefined): string {
  if (!endTime || endTime <= 0) return '-'
  // backend stores unix seconds
  const d = new Date(endTime * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi
}

export function SubscriptionStatusCard({ sub }: SubscriptionStatusCardProps) {
  const { t } = useTranslation()
  const title = sub.plan?.title ?? 'Plan #' + sub.subscription.plan_id
  const expiry = sub.subscription.end_time
  const allowedModels = sub.plan?.allowed_models ?? ''

  return (
    <div className="bg-card text-card-foreground space-y-6 rounded-xl border p-6 shadow-sm">
      {/* Hero: plan name + expiry + actions */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs uppercase tracking-wider">
            {t('Current subscription')}
          </p>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <span className="bg-primary h-2.5 w-2.5 rounded-full" aria-hidden="true" />
            {title}
          </h2>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <CalendarClock className="h-3.5 w-3.5" />
            {t('Expires at') + ' ' + formatExpiryDate(expiry)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/plans"
            className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors"
          >
            {t('Manage subscription')}
          </Link>
          <Link
            to="/plans"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors"
          >
            {t('Upgrade')}
          </Link>
        </div>
      </header>

      {/* Window meters: 5h + weekly */}
      <SubscriptionWindowMeters sub={sub} t={t} />

      {/* Allowed models */}
      <AllowedModelsList allowedModelsCsv={allowedModels} />
    </div>
  )
}

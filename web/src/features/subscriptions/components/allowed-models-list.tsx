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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

interface AllowedModelsListProps {
  // Comma-separated model names from SubscriptionPlan.allowed_models.
  // Empty string means the plan has no model restriction.
  allowedModelsCsv: string
  className?: string
}

export function AllowedModelsList({
  allowedModelsCsv,
  className,
}: AllowedModelsListProps) {
  const { t } = useTranslation()
  const models = (allowedModelsCsv || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

  if (models.length === 0) {
    return (
      <p className={className + ' text-muted-foreground text-sm'}>
        {t('No model restrictions')}
      </p>
    )
  }

  return (
    <div className={className}>
      <p className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">
        {t('Allowed models')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {models.map((m) => (
          <Badge key={m} variant="secondary" className="font-mono text-xs">
            {m}
          </Badge>
        ))}
      </div>
    </div>
  )
}

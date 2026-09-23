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
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authenticated/plans/details')({
  component: PricingDetailsPage,
})

function PricingDetailsPage() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Pricing Details')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
          <Link
            to="/plans"
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('Back to Plans')}
          </Link>

          {/* How limits work */}
          <section className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {t('How limits work')}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(
                'Both the 5-hour and weekly limits are sliding windows. They count requests, not tokens. The window slides continuously — you do not lose all your quota at a fixed time.',
              )}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(
                'Example: 100 requests at 10am fall out of the 5-hour count at 3pm. There is no fixed reset time.',
              )}
            </p>
          </section>

          {/* Tier comparison table */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">
              {t('Tier comparison')}
            </h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground"></th>
                    <th className="px-4 py-3 font-semibold">Plus</th>
                    <th className="px-4 py-3 font-semibold">Max</th>
                    <th className="px-4 py-3 font-semibold">Ultra</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t('Monthly')}
                    </td>
                    <td className="px-4 py-3 tabular-nums">¥49</td>
                    <td className="px-4 py-3 tabular-nums">¥119</td>
                    <td className="px-4 py-3 tabular-nums">¥469</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      5-hour limit
                    </td>
                    <td className="px-4 py-3 tabular-nums">1,500</td>
                    <td className="px-4 py-3 tabular-nums">4,500</td>
                    <td className="px-4 py-3 tabular-nums">15,000</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      Weekly limit
                    </td>
                    <td className="px-4 py-3 tabular-nums">15,000</td>
                    <td className="px-4 py-3 tabular-nums">45,000</td>
                    <td className="px-4 py-3 tabular-nums">150,000</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* What counts as a request */}
          <section className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {t('What counts as a request?')}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(
                'Any call to /v1/chat/completions, /v1/messages, or /v1/embeddings counts as one request, regardless of token count. Streaming requests count once at completion. Failed requests (4xx, 5xx) do not count.',
              )}
            </p>
          </section>

          {/* Exceed limit */}
          <section className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {t('What happens if I exceed the limit?')}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(
                'Additional requests are billed against your wallet balance at standard upstream rates. There is no hard cutoff.',
              )}
            </p>
          </section>

          <div className="pt-4">
            <Button size="lg" onClick={() => window.history.back()}>{t('Back to Plans')}</Button>
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

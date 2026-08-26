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
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { TooltipProvider } = await import('@/components/ui/tooltip')
const { ApiKeyGroupCell } = await import('../api-key-group-cell')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Cross-group': 'Cross-group',
        'Automatically selects the best available group with circuit breaker mechanism':
          'Automatically selects the best available group with circuit breaker mechanism',
      },
    },
  },
})

function CellHarness(props: {
  group: string
  crossGroupRetry?: boolean
  shouldReduceMotion?: boolean
}) {
  return (
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <ApiKeyGroupCell
          group={props.group}
          crossGroupRetry={props.crossGroupRetry ?? false}
          shouldReduceMotion={props.shouldReduceMotion ?? false}
        />
      </TooltipProvider>
    </I18nextProvider>
  )
}

describe('API key group table cell', () => {
  test('renders the Auto cross-group badge without exposing any group ratio', () => {
    const { container } = render(
      <CellHarness
        group='auto'
        crossGroupRetry
        shouldReduceMotion={false}
      />
    )

    const badgeCell = container.querySelector<HTMLElement>(
      '[data-api-key-group-cell="auto"]'
    )
    expect(badgeCell).toHaveClass('overflow-visible')

    // Group ratios are hidden from users; no ratio frame or badge should render.
    expect(container.querySelectorAll('[data-auto-group-frame]').length).toBe(0)
    expect(
      container.querySelectorAll('[data-auto-group-flow-border]').length
    ).toBe(0)
    expect(
      container.querySelector('[data-auto-group-effect="ratio"]')
    ).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent(/Ratio/)

    expect(container).toHaveTextContent('Cross-group')
    const crossGroupBadge = [
      ...container.querySelectorAll<HTMLElement>('[data-slot="status-badge"]'),
    ].find((badge) => badge.textContent === 'Cross-group')
    expect(crossGroupBadge).not.toBeUndefined()
  })

  test('renders a normal group badge without any ratio frame or text', () => {
    const { container } = render(<CellHarness group='vip' />)

    expect(container).toHaveTextContent('vip')
    expect(container).not.toHaveTextContent(/Ratio/)
    expect(container).not.toHaveTextContent(/x/)
    expect(container.querySelector('[data-auto-group-frame]')).toBe(null)
    expect(container.querySelector('[data-auto-group-flow-border]')).toBe(
      null
    )
  })
})

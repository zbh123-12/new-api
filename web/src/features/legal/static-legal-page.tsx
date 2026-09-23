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
import type { ReactNode } from 'react'

import { PublicLayout } from '@/components/layout'

interface StaticLegalProps {
  title: string
  sections: Array<{ heading?: string; paragraphs: ReactNode[] }>
}

// Lightweight static legal page. Admin-configurable terms live in the
// LegalDocument-backed pages (e.g. /user-agreement). This is the fallback
// pattern for pages that aren't wired to a backend document store yet.
export function StaticLegalPage({ title, sections }: StaticLegalProps) {
  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-8 py-12">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            最后更新:2026-09-19
          </p>
        </header>
        {sections.map((section, i) => (
          <section key={i} className="space-y-3">
            {section.heading && (
              <h2 className="text-xl font-semibold tracking-tight">
                {section.heading}
              </h2>
            )}
            {section.paragraphs.map((p, j) => (
              <p key={j} className="text-muted-foreground text-sm leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </PublicLayout>
  )
}

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

import { GroupBadge } from '@/components/group-badge'
import { cn } from '@/lib/utils'

export const AUTO_GROUP_FRAME_CLASS_NAME =
  'border-primary/40 relative overflow-visible border shadow-sm shadow-primary/10'

type AutoGroupFlowBorderProps = {
  shouldReduceMotion: boolean
}

export function AutoGroupFlowBorder(props: AutoGroupFlowBorderProps) {
  if (props.shouldReduceMotion) return null

  return (
    <span
      aria-hidden='true'
      data-auto-group-flow-border='true'
      className='auto-group-flow-border pointer-events-none absolute -inset-px'
    />
  )
}

type AutoGroupFrameProps = {
  children: ReactNode
  className?: string
  shouldReduceMotion: boolean
}

export function AutoGroupFrame(props: AutoGroupFrameProps) {
  return (
    <span
      data-auto-group-frame='true'
      data-auto-group-effect='badge'
      className={cn(
        AUTO_GROUP_FRAME_CLASS_NAME,
        'inline-flex max-w-full shrink-0 rounded-4xl p-px',
        props.className
      )}
    >
      <AutoGroupFlowBorder shouldReduceMotion={props.shouldReduceMotion} />
      {props.children}
    </span>
  )
}

export function AutoGroupBadge(props: AutoGroupFlowBorderProps) {
  return (
    <AutoGroupFrame
      shouldReduceMotion={props.shouldReduceMotion}
    >
      <GroupBadge group='auto' />
    </AutoGroupFrame>
  )
}

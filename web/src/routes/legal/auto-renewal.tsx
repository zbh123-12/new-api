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
import { createFileRoute } from '@tanstack/react-router'

import { StaticLegalPage } from '@/features/legal/static-legal-page'

export const Route = createFileRoute('/legal/auto-renewal')({
  component: AutoRenewalPolicy,
})

function AutoRenewalPolicy() {
  return (
    <StaticLegalPage
      title="自动续费规则"
      sections={[
        {
          paragraphs: [
            '本规则适用于本平台提供的所有订阅套餐自动续费服务。订阅套餐默认启用自动续费,请仔细阅读以下规则。',
          ],
        },
        {
          heading: '一、自动续费说明',
          paragraphs: [
            '订阅套餐默认启用自动续费。每个计费周期结束时,系统将自动从您的钱包余额扣除下一周期费用。',
            '若钱包余额不足,系统将提示充值,套餐将在当前周期到期后转为非订阅状态。',
          ],
        },
        {
          heading: '二、扣款时间',
          paragraphs: [
            '续费扣款将在当前订阅周期结束前 24 小时内发起。',
            '扣款成功后,新周期的服务立即生效,可在订阅页面查看最新到期时间。',
          ],
        },
        {
          heading: '三、取消方式',
          paragraphs: [
            '您可随时取消自动续费。取消将在当前周期结束后生效,本周期内仍可正常使用。',
            '取消路径:订阅套餐页面 → 当前订阅卡片 → 关闭自动续费开关。',
            '当前周期已支付的费用不予退还。',
          ],
        },
        {
          heading: '四、退款政策',
          paragraphs: [
            '订阅一经购买,不支持无理由退款。',
            '若服务出现重大故障且无法在合理时间内修复,可申请按未使用天数比例退款。',
            '退款申请需联系客服并提供相关证据,审核周期为 3-5 个工作日。',
          ],
        },
        {
          heading: '五、争议解决',
          paragraphs: [
            '因本规则产生的争议,双方应友好协商解决。',
            '协商不成的,任一方可向本平台所在地有管辖权的人民法院提起诉讼。',
          ],
        },
      ]}
    />
  )
}

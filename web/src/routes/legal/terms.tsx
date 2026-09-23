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

export const Route = createFileRoute('/legal/terms')({
  component: TermsOfService,
})

function TermsOfService() {
  return (
    <StaticLegalPage
      title="服务条款"
      sections={[
        {
          paragraphs: [
            '欢迎使用本平台提供的 AI 模型调用网关服务(以下简称"本服务")。请仔细阅读以下条款,使用本服务即表示您同意接受本条款的约束。',
          ],
        },
        {
          heading: '一、服务说明',
          paragraphs: [
            '本服务是一个 AI 模型聚合网关,将您的请求转发至上游 AI 提供商(OpenAI、Claude、Gemini 等)并返回结果。',
            '您可通过订阅套餐或钱包余额的方式使用本服务。具体价格、限额以上游实际成本和平台定价为准。',
          ],
        },
        {
          heading: '二、账户与安全',
          paragraphs: [
            '您应妥善保管自己的账户凭证(用户名、密码、API Key 等),因凭证泄露导致的任何损失由您自行承担。',
            '禁止将您的账户凭证以任何形式分享、转让或出售给他人。',
          ],
        },
        {
          heading: '三、使用规范',
          paragraphs: [
            '您承诺不将本服务用于任何违反所在地法律法规的活动。',
            '禁止利用本服务生成、传播违法、淫秽、暴力、歧视或其他违反公序良俗的内容。',
            '禁止利用本服务进行任何形式的攻击、滥用、刷量或其他破坏平台正常运行的行为。',
          ],
        },
        {
          heading: '四、套餐与计费',
          paragraphs: [
            '订阅套餐的具体价格、限额、有效期以您购买时平台显示的内容为准。',
            '超出套餐限额的部分,将从您的钱包余额按上游倍率扣除;钱包余额不足时,请求将被拒绝。',
            '套餐一经购买,具体退款政策详见《自动续费规则》。',
          ],
        },
        {
          heading: '五、免责声明',
          paragraphs: [
            '本服务按"现状"提供,不对服务的可用性、准确性、时效性做任何明示或暗示的保证。',
            '上游 AI 提供商生成内容由其自身负责,本平台不对内容准确性承担连带责任。',
            '因网络、不可抗力或上游服务中断造成的损失,本平台不承担赔偿责任。',
          ],
        },
        {
          heading: '六、条款变更',
          paragraphs: [
            '本平台有权根据法律法规变化或业务需要修改本条款,修改后的条款一经发布即生效。',
            '重大变更将通过站内通知、邮件等方式告知。请您定期查阅本条款。',
          ],
        },
      ]}
    />
  )
}

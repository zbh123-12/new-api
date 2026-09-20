# Changelog — new-api

Recent changes (newest first). Generated from git log + working tree diff on 2026-09-18.

## Phase 1 — 2026-09-20: 套餐用量集中页 /plans/current

新增路由 `/plans/current`,集中展示当前订阅的:
- 套餐名 + 到期时间
- 5h + 周限额用量进度条(复用 SubscriptionWindowMeters)
- 允许的模型列表(badge)
- 返回 /plans 链接 + 无订阅时的"浏览套餐"按钮

`/plans` 顶部"当前订阅"卡片新增"查看用量详情 →"链接,
跳转到新页。

### 新增文件
- `web/src/features/subscriptions/components/allowed-models-list.tsx` — allowed_models CSV → badge 列表
- `web/src/features/subscriptions/components/subscription-status-card.tsx` — Hero + window meters + actions
- `web/src/routes/_authenticated/plans/current.tsx` — 路由 + 空态处理

### 修改文件
- `web/src/routes/_authenticated/plans/index.tsx` — 顶部卡片加"查看用量详情"链接

### 新增 i18n keys(12)
- Subscription Usage / 套餐用量
- View current subscription and usage details / 查看当前订阅与用量明细
- Current subscription / 当前订阅
- Expires at / 到期时间
- Manage subscription / 管理订阅
- Upgrade / 升级
- Allowed models / 允许的模型
- No model restrictions / 无模型限制
- Back to plans / 返回套餐列表
- You have no active subscription. / 您当前没有生效中的订阅。
- Browse plans / 浏览套餐
- View usage details / 查看用量详情

### 回退
```bash
git log --grep="\[sub-page\] phase-1"        # 找到 SHA
git revert <sha>                          # 一键回退
```

## Phase 1.1 — 2026-09-20: 购买成功跳转套餐详情页

用户购买成功后(钱包余额支付成功路径),自动跳转到 `/plans/current` 套餐详情页。
外部支付(Stripe/Creem/Epay/WaffoPancake)的"打开支付页"流程不跳转,
因为实际支付在外部完成,用户回站后从 `/plans` 顶部"查看用量详情"链接进入。

修改文件:
  web/src/features/subscriptions/components/dialogs/subscription-purchase-dialog.tsx
    + import useNavigate from @tanstack/react-router
    + 调用 navigate({ to: '/plans/current' }) 在 handlePayBalance 成功路径上

回退命令:
  git log --grep='phase-1.1'
  git revert <sha>


## Phase 1.2 — 2026-09-20: 重试 + 防重复购买

### 问题 1:跳转后空态
`/plans/current` 页面 fetch `/api/subscription/self` 改成重试 3 次(1s 间隔),
处理后端 commit 延迟或 fetch 与 navigate 之间的时序竞争。
首次失败不报错,继续等下一次。

### 问题 2:用户能重复买同一档
分两层防护:

**前端(主路径)** `web/src/features/wallet/components/subscription-plans-card.tsx`:
- 按当前订阅状态动态计算按钮文案:
  - 无订阅 → "选择 X"
  - 同档 → 按钮禁用 + "已是当前档位"
  - 已达最高档 → 按钮禁用 + "已是最高档位"
  - 高于当前档 → "升级到 X"
  - 低于当前档 → "降级到 X"

**后端(防绕过)** `controller/subscription.go` + `model/subscription.go`:
- 新增 `GetActiveSubscriptionForPlan(userId, planId)` 查询当前是否有同档有效订阅
- `paySubscriptionBalance` handler 在事务外先查,有则返回错误
- 错误消息走 i18n:`Subscription.DuplicateActivePlan`(en/zh/zh-TW 翻译)

### 新增文件
- 无

### 修改文件
- web/src/routes/_authenticated/plans/current.tsx — 重试逻辑
- web/src/features/wallet/components/subscription-plans-card.tsx — 按钮文案动态化
- web/src/i18n/locales/{en,zh,zh-TW,fr,ja,ru,vi}.json — 4 个新 key
- model/subscription.go — GetActiveSubscriptionForPlan helper
- controller/subscription.go — i18n 导入 + guard 调用
- i18n/locales/{en,zh-CN,zh-TW}.yaml — Subscription.DuplicateActivePlan 翻译

### 回退命令
```bash
git log --grep='phase-1.2'
git revert <sha>
```

## Phase 1.3 — 2026-09-20: 套餐详情页入口 + 历史订阅回退

### Issue 1:无法进入套餐详情页(只能买完后跳转)
两条新入口,无论是否有订阅都能进:
- **侧边栏** Personal 区加 "我的订阅" / My Subscription 入口 → /plans/current
- **/plans 页顶部** 永远显示 "View my subscription →" 链接(原"查看用量详情"只在有订阅时显示)

### Issue 2:套餐详情页空
两条改进:
- `/plans/current` 改用 `all_subscriptions` fallback —— 用户曾订阅过期后也能看到记录
- 渲染判断从 `selfSub?.subscription` 改为 `selfSub`,历史订阅也能进状态卡(过期会用过去时间显示)

### 新增文件
- 无

### 修改文件
- web/src/hooks/use-sidebar-data.ts — 个人区加 My Subscription 入口
- web/src/routes/_authenticated/plans/index.tsx — 顶部链接始终显示
- web/src/routes/_authenticated/plans/current.tsx — fallback 到 all_subscriptions + 放宽渲染条件
- web/src/i18n/locales/{en,zh,zh-TW,fr,ja,ru,vi}.json — 1 个新 key: My Subscription

### 回退命令
```bash
git log --grep='phase-1.3'
git revert <sha>
```

## Uncommitted

## Uncommitted

## Uncommitted
 (working tree dirty, 2026-09-18)

These changes are in the working tree but not yet committed. Need review before commit.

### Feature: Sidebar entry for subscription plans
- File: `web/src/hooks/use-sidebar-data.ts`
- Added a `Plans` (套餐) entry under the 个人 (Personal) category in the left sidebar.
- Icon: `Sparkles` (from lucide-react)
- URL: `/plans`
- Order: 钱包 → 套餐 → 个人资料

### Feature: i18n for sidebar Plans entry
- Files: `web/src/i18n/locales/{en,zh,zh-TW,fr,ja,ru,vi}.json`
- Added key: `Plans`
  - en: `Plans`
  - zh: `套餐`
  - zh-TW: `訂閱方案`
  - fr: `Forfaits`
  - ja: `プラン`
  - ru: `Тарифы`
  - vi: `Gói`

### Bugfix: /plans page shows 未配置支付方式 for everyone
- File: `web/src/routes/_authenticated/plans/index.tsx`
- Root cause: Page was using raw `fetch` without an Authorization header. Backend rejected with 401 → empty pay_methods → button showed "Payment not configured" for all logged-in users.
- First attempt: Switched to `getTopupInfo()` helper (which uses axios + auto Bearer token). Also changed `res.ok` → `res.success && res.data`. Still broken — the helper returns `{success, message, data: TopupInfo}`, but the page did `setTopupInfo(data?.data || null)` which wrapped it an extra time, producing `null`.
- Final fix: Replaced all manual fetch + state code with `useTopupInfo()` hook (same as wallet page). Hook auto-handles auth + parsing. Removed the broken useState for topupInfo and the broken `data?.data` logic.

### Chore: Dockerfile hardening
- File: `Dockerfile`
- Changed ENV GOPROXY to a 4-proxy fallback: goproxy.cn, mirrors.aliyun.com/goproxy, goproxy.io, direct
- Added BuildKit cache mounts to go mod download and go build: /go/pkg/mod and /root/.cache/go-build
- Result: subsequent builds reuse the module cache instead of re-downloading from flaky proxies.

### DB change (manual, not in code)
- Table: `options`, key: `PayMethods`
- Old value: only 1 method (Alipay in test mode)
- New value: 3 methods (alipay 支付宝, wxpay 微信支付, custom1 自定义支付)
- Requires `docker compose restart new-api` to reload from OptionMap.

---

## Commit 45d5236 — chore: remove leftover debug files
Date: 2026-09-09
- Deleted: build.log, probe-frontend-build.cmd, probe-frontend.log

## Commit 711b83d — feat(wallet): integrate SubscriptionWindowMeters, fix /plans empty title, repair 500 in SubscriptionPlansCard
Date: 2026-09-09
- Integrated SubscriptionWindowMeters (5h/weekly progress bars) into /plans page current-subscription card
- Fixed empty title bug: `selfSub.subscription.plan?.title` → `selfSub.plan?.title || Plan #${plan_id}`
- **Repaired 500 in SubscriptionPlansCard**: `<Separator>` was used but not imported. Added `import { Separator } from "@/components/ui/separator"`. Also fixed other pre-existing missing imports.

## Commit 2bcb315 — feat(wallet): complete MaxTopUp wiring in TopupInfo type and recharge form
Date: 2026-09-09
- Added `max_topup?: number` to TopupInfo type
- Replaced placeholder `Minimum {minTopup}` with new i18n key `Topup amount range hint` that includes both min and max

## Commit 11e9102 — fix(subscriptions): complete CNY display migration in purchase dialog
Date: 2026-09-09
- In SubscriptionPurchaseDialog: replaced raw token display with `formatCurrencyFromUSD(balanceCost / quotaPerUnit)`
- Renamed "Pay with Balance" → "Pay with Wallet Balance" (more standard)
- Renamed "Required" → "This payment will cost"
- Renamed "Available" → "Current Balance"
- Renamed "Insufficient balance" → "Insufficient wallet balance"

## Commit cf554a2 — fix(router): make /api/subscription/plans public for unauthenticated pricing view
Date: 2026-09-09
- Moved GET /api/subscription/plans out of the UserAuth() group to allow unauthenticated visitors to see pricing on the /plans marketing page
- Self/buy endpoints remain protected

## Commit c9c2934 — feat: add dedicated /plans route for subscription plans page
Date: 2026-09-09
- New file: web/src/routes/_authenticated/plans/index.tsx (76 lines)
- Title: "Subscription Plans", description: "Simple, transparent pricing that scales with you"
- Renders: current subscription card (if any) + SubscriptionPlansCard
- Added route in routeTree.gen.ts

## Earlier commits (subscription feature origin)
- 1d4211c feat: redesign subscription plans page with marketing-grade UI (3 cards: Basic/Pro/Flagship, monthly/yearly toggle)
- 1fab5eb fix: use window.location.href for custom-protocol chat links
- 2c889c9 fix: restore custom-protocol chat preset URLs + auto-generate default token
- 210a397 feat: add admin-configurable MaxTopUp, default 1000 CNY
- cde0fdb chore: unify all price display to CNY (¥) + E2E auto-bootstrap test user
- 3ce63f3 fix: stop forcing subscription plan currency to USD
- d50af6e chore: drop MiniMax brand mentions from window-limit feature
- b056e7d feat: subscription plan 5h/weekly request-count limits + i18n for all locales
- 203f033 feat: enforce subscription model allow-list + UI lock-down
- 1a00894 fix: enforce subscription allow-list in PreConsume + relay FreeModel path
- 233175a backup: snapshot before subscription allow-list hardening
- f116414 fix: settle Responses cached token usage (#6892)

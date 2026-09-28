# new-api 项目会话交接

**目的**: 任何新开的 Codex 会话读这一份文件就能理解项目当前状态、已完成工作、决策依据、待办事项。

## 1. 基本面
- repo: C:\Users\93630\Documents\ChatGPT\new-api
- 当前分支: codex/phase2-billing-bypass (13 commits,已 push 到 origin)
- 远端: origin = https://github.com/zbh123-12/new-api.git (用户 fork)
- 上游: upstream = https://github.com/QuantumNous/new-api.git (官方)
- Docker: new-api / postgres / redis 都 healthy (port 3000)
- Go 不在 PATH: 用 docker run --rm golang:1.25-alpine 跑后端
- GitHub 网络不稳, push 经常要重试多次

## 3. commit 历史(13 个)
 8b08c9b feat(plan): customizable window quota duration (seconds)            ← Phase 2.4
 ef7c34a feat(admin): simple numeric window quota inspection page             ← Phase 2.3
 5de4864 feat(subscription): MiniMax-style window quota UI                    ← Phase 2.2
 8006538 feat(subscription): token-based window quotas with one-sub rule      ← Phase 2.1
 0adb30a fix: restore legal routes, plans details, and window meters files   ← Phase 1
 1cd19d4 fix(i18n): align subtitle interpolation braces with locale keys
 53213e7 feat(keys): hide Quota and Group columns for non-admin users
 26a2884 docs: changelog for phase 2.1 and 2.2
 bc22ba5 feat(keys): replace non-admin quota input with billing state card + radio
 772ff1c merge: bring in plans auth header fix
 0f7688e fix(billing): allow wallet fallback when token quota exhausted
 fa02a6 docs: changelog for /plans auth header fix
 70a680f fix(plans): use authenticated api helper so /plans pages pass UserAuth


## 4. Phase 2 详细总结(2.1 - 2.4)

### Phase 2.1 后端 token-based 窗口配额
- model/subscription.go 字段重命名 LimitCount* → LimitQuota*(Go 字段名;JSON tag 和 DB 列名保留原样:limit_count_5h)
- 加 subscriptionWindowQuotaIncr/Decr(delta int64) — Redis INCRBY 而非 +1
- 加 ApplySubscriptionWindowQuotaUsage(plan, delta) — 结算时调整
- 加 SubscriptionWindowQuotaRefund(plan, delta) — 失败时回滚
- CheckSubscriptionWindowLimits(userId, plan, preCallDelta int64) — 接受 quota 增量
- 加 GetSubscriptionWindowUsage(userId) — 读 Redis 实时返回 6 个 window 字段
- service/billing_session.go: Settle 调 Apply,Refund 调 Refund,gopool.Go 异步回滚
- controller/subscription.go PurchaseSubscriptionWithBalance: 加 HasActiveUserSubscription 校验
- 测试: model/window_quota_test.go 8 个 PASS(覆盖 incr/decr/apply/refund/fail-open/zero-delta)

### Phase 2.2 用户 MiniMax 风格 UI
- 后端 GetSubscriptionSelf 返回 6 个字段:window_limit_5h、window_usage_5h、window_reset_5h_unix、window_limit_weekly、window_usage_weekly、window_reset_weekly_unix
- web/src/features/wallet/components/subscription-window-meters.tsx 重写:进度条(emerald 5h / orange weekly) + 百分比 + 重置倒计时,不显示 token 数
- web/src/features/subscriptions/components/subscription-status-card.tsx 加 data prop
- web/src/routes/_authenticated/plans/{current,index}.tsx 用 SelfSubscriptionData
- i18n 7 keys × 7 locales(window.5h.title,window.weekly.title,window.noUsage,window.resettingNow,window.resetIn.{dhm,hm,m})

### Phase 2.3 Admin 数字面板
- 后端 controller.AdminGetUserWindowUsage + 路由 GET /api/subscription/admin/users/:id/window-usage
- 前端 web/src/routes/_authenticated/admin/users/window-quota.tsx — Admin 输入 userId 查精确 token 数
- i18n 14 keys × 7 locales(admin.user.subscription.*)

### Phase 2.4 自定义窗口长度
- 后端 controller 校验:LimitQuota5Hour > 0 && LimitQuota5HourWindowSeconds < 60 → 拒绝(防 typo)
- plan-form.ts 加 2 字段,默认 18000(5h)/604800(7d),最小 60 秒
- subscriptions-mutate-drawer.tsx 加 2 FormField
- i18n 6 keys × 7 locales(plan.field.window{5h,Weekly}Seconds.{label,help,placeholder})


## 5. 关键架构决策
| 决策 | 答案 |
|------|------|
| 字段命名(Go vs DB) | Go LimitQuota*,JSON tag 保留 limit_count_*,DB 列名不变(Q1=B)|
| 一用户一套餐 | 双层防护:controller HasActiveUserSubscription 已加;DB unique partial index 待补(见 §7.1)|
| 窗口 quota 单位 | quota(token 换算后),不是 request count |
| Redis key 格式 | sub:rl:{window}:{uid}:{pid}(plan-scoped)|
| User UI | 百分比 + 重置倒计时,不显示 token 数 |
| Admin UI | 精确 token 数 + 数字面板(/admin/users/window-quota?userId=N)|
| 失败路径 | wallet + subscription + window quota 三方回滚 |
| Redis down | fail-open + 日志(不阻塞请求)|

## 6. 防漏洞清单(已实施)
- Pre-call Redis 估算 → 超额返回 429
- Post-call Redis INCRBY 实际 quota(差额调账)
- 失败路径 Refund:wallet + sub + window 三方回滚
- Redis down → fail-open
- Window seconds 最小 60 秒(防 typo)
- 一用户一套餐(双层防护 app 层已加,DB 层待补)


## 7. 待办事项(按优先级)

### 7.1 DB 层 unique partial index(重要)
位置:model/main.go 的 AutoMigrate 之后,需要三库兼容:
SQLite / PostgreSQL:CREATE UNIQUE INDEX user_active_sub ON user_subscriptions(user_id) WHERE status=active;
MySQL(无 partial index,用 generated column):ALTER TABLE user_subscriptions ADD COLUMN is_active TINYINT GENERATED ALWAYS AS (CASE WHEN status=active THEN 1 ELSE NULL END) STORED;CREATE UNIQUE INDEX user_active_sub ON user_subscriptions(user_id, is_active);
参考:model/main.go 看 AutoMigrate 模式。

### 7.2 Step 5: admin unlimited_quota=true 守卫
controller/key.go 加守卫:非 admin 用户不能创建 unlimited quota key。状态:等用户决策(产品问题)。

### 7.3 清理工作树(可选,纯脏文件)
- .pnpm-store/* 噪音(全部删)
- .gitignore 加 /plans/(根目录)让 plans 不再匹配子目录
- 调试残留:test_path.txt、test_path2.txt、docs/HANDOFF.md(这份)

### 7.4 PR 准备
13 commits 可以合并成 1 个 PR。
- 标题:feat(subscription): phase 2 — token-based window quotas + admin insights
- AGENTS.md 要求:AI 协助需要标注(git user.name=Your Name 不是项目历史开发者 Qi)

### 7.5 端到端验证
docker ps  # 验证容器在跑
1. 普通用户(12345678/Test1234!)登录 → /plans/current → 看到 MiniMax 风格
2. admin(root/Test1234!)登录 → /admin/users/window-quota?userId=23 → 精确 token 数
3. admin 创建套餐 → 测试 3600 秒自定义窗口
curl http://localhost:3000/api/subscription/admin/users/23/window-usage


## 8. 测试账号
普通用户: 12345678 / Test1234!
  id=23, role=1, wallet=585 CNY, active Ultra 套餐(id=81)
管理员: root / Test1234!
  id=1, role=100 (admin), wallet=1170 CNY
渠道: test-net(id=2, balance=0)

## 9. 关键文件清单(后续工作要碰的)
后端:
  controller/subscription.go        ← 改过多次,DB unique index 要加在这
  model/subscription.go              ← 主要数据模型,字段重命名在这
  service/billing_session.go         ← 计费会话,window quota 集成
  service/funding_source.go          ← 资金来源接口(wallet / subscription)
  router/api-router.go              ← 路由注册
  model/main.go                      ← AutoMigrate,DB unique index 加在这
  model/window_quota_test.go        ← 已写,Phase 2.1

前端:
  web/src/features/subscriptions/types.ts                                ← SubscriptionPlan + SelfSubscriptionData
  web/src/features/subscriptions/lib/plan-form.ts                       ← Zod schema + defaults
  web/src/features/wallet/components/subscription-window-meters.tsx       ← MiniMax 风格组件
  web/src/features/subscriptions/components/subscriptions-mutate-drawer.tsx ← Admin plan 表单
  web/src/routes/_authenticated/plans/{current,index}.tsx               ← 用户 UI
  web/src/routes/_authenticated/admin/users/window-quota.tsx             ← Admin 数字面板
  web/src/lib/api.ts                                                    ← API helpers
  web/src/i18n/locales/{en,zh,zh-TW,fr,ja,ru,vi}.json                 ← 7 语言


## 10. 工作树脏文件(全部是噪音,不要 commit)
.pnpm-store/v11/projects/.../*  (pnpm 缓存镜像噪音)
web/src/features/keys/components/api-keys-{columns,mutate-drawer,table}.tsx  (未相关改动)
web/src/features/subscriptions/components/dialogs/subscription-purchase-dialog.tsx
web/src/features/wallet/components/subscription-plans-card.tsx
web/src/hooks/use-sidebar-data.ts
web/src/routeTree.gen.ts  (路由生成器自动改)
web/src/styles/theme.css  (仅 CRLF 差异)
docs/HANDOFF.md  (这份,gitignore 不管它)
test_path.txt / test_path2.txt  (调试残留)
注意:.gitignore 含 plans 路径导致 web/src/routes/_authenticated/plans/ 误判为忽略,提交时要 git add -f。

## 11. 环境工具说明
- PowerShell 限制: 反引号 + 美元符 i 多变量同一行会被 policy 拦截,必须分多行
- CRLF vs LF: 项目 .tsx/.ts 用 CRLF;改这些文件用 Get-Content / Set-Content 保留
- 文件路径含美元符: Move-Item / Remove-Item 会展开变量;用 Get-Content -LiteralPath 或 [System.IO.File] API
- Docker daemon: 经常自动关闭,需要 Start-Process Docker Desktop.exe 重启,等 ~30 秒
- GitHub 网络: 不稳,需多次重试 push(间隔 30-90 秒)
- AGENTS.md 必读: 项目规约 — 后端测试用 testify/require + assert,i18n 必走脚本,DB 三库兼容,字段命名约定

## 12. 新会话开场白模板
继续 new-api 项目。当前分支 codex/phase2-billing-bypass,13 个 commits 已 push。请读 docs/HANDOFF.md 和 AGENTS.md。下一件事是 [DB unique partial index / Step 5 admin guard / 清理工作树 / PR 准备 / e2e 验证]。

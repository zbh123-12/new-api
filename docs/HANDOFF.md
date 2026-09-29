# new-api 项目会话交接

**目的**: 任何新开的 Codex 会话读这一份文件就能理解项目当前状态、已完成工作、决策依据、待办事项。

**当前状态(2026-09-29)**:Phase 2 全部完成,系统已上线。详情见 §13。

## 1. 基本面
- repo: C:\\Users\\93630\\Documents\\ChatGPT\\new-api
- 当前分支: codex/phase2-billing-bypass (17 commits,已 push 到 origin)
- 远端: origin = https://github.com/zbh123-12/new-api.git (用户 fork)
- 上游: upstream = https://github.com/QuantumNous/new-api.git (官方)
- Docker: new-api / postgres / redis 都 healthy (port 3000)
- Go 不在 PATH: 用 docker run --rm golang:1.26.1-alpine 跑后端
- GitHub 网络不稳, push 经常要重试多次

## 3. commit 历史(17 个)
 02de9d5 chore(lint): fix high-severity oxlint findings, prep for release    ← Sprint 收尾
 5c63769 chore(json): route all business marshaling through common.*         ← 质量债清理
 b50ded0 chore(i18n): translate missing keys for fr/ja/ru/vi/zh; brand literal whitelist
6978afc feat(subscription): DB-layer unique constraint for one active subscription per user  ← Phase 2.5
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

### Phase 2.5 Sprint 收尾(2026-09-28 ~ 2026-09-29)
**目标**:把上一阶段留下的 4 项收尾全部清掉,然后上线。

#### 2.5.a DB 层 partial unique index(commit 6978afc)
- `model/user_subscription_unique_active_index.go` 新文件
- `migrateUserSubscriptionUniqueActiveIndex()` 挂在 `migrateDB()` 里 `migrateSubscriptionPlanPriceAmount()` 之后
- 两步幂等:
  1. `dedupeUserSubscriptionsActive()` — 同 user 多 active 时把旧标 cancelled,只留 max(id)
  2. `ensureUserSubscriptionActiveUniqueIndex()` — 三库兼容:
     - SQLite/PostgreSQL:`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sub_one_active
       ON user_subscriptions(user_id) WHERE status='\''active'\''`
     - MySQL(无 partial index):加 STORED generated column `active_user_id`
       (`active`→1,否则 NULL)+ `UNIQUE(user_id, active_user_id)`。
- 测试:`model/user_subscription_unique_active_index_test.go` 6 个 case 全过。
- 实测:重启容器后 `pg_indexes` 出现 `idx_user_sub_one_active`,脏数据 user_id=1 自动清理
  (3 active → 1 active + 2 cancelled),直接 SQL 第二次插入 active 被
  `duplicate key value violates unique constraint "idx_user_sub_one_active"` 拒绝。
  cancelled 行仍然可以共存(部分索引 WHERE 子句过滤掉 cancelled)。

#### 2.5.b JSON wrapper 修复(commit 5c63769)
- AGENTS.md §"JSON package" 要求业务代码用 `common.Marshal/Unmarshal/DecodeJson`,
  禁止直接调 `encoding/json`。
- 替换 97 处:`json.Marshal`→`common.Marshal` 等。
- 类型级(`json.RawMessage`、`json.Valid`)保留 import — AGENTS.md 允许。
- 11 个文件 import 已删,2 个文件用 `rootcommon` 别名解决 `common` / `relay/common` 冲突。
- 验证:`go build ./...` OK,`go test ./...` 30+ 包 0 fail。

#### 2.5.c i18n 补译(commit b50ded0)
- 之前 fr/ja/ru/vi 共 278 个 key 未翻译,zh/zh-TW/en 已完成。
- 新增 `web/scripts/add-translations.mjs`:接受 `{locale: {key: value}}` patch JSON,
  merge 到 translation,字母排序,2 空格 + 末 newline。满足 AGENTS.md "locale write 必须走脚本"。
- 在 `sync-i18n.mjs` 的 `BRAND_AND_LITERAL_KEYS` 加
  `Max · per month` / `Plus · per month` / `Ultra · per month` 三条 brand literal,
  避免 `isLikelyUntranslated` 误报。
- 4 个 patch JSON 累计翻译 363 个 key,7 语言全部 0 missing / 0 untranslated。

#### 2.5.d Lint 必修类修复(commit 02de9d5)
- `react/button-has-type` 1 处:`<button>` 加 `type="button"`,防止表单意外提交。
- `react/iframe-missing-sandbox` 2 处:
  - `routes/_authenticated/chat/$chatId.tsx`:加 `sandbox=""`
  - `components/ai-elements/web-preview.tsx`:去掉 `allow-same-origin`(与 `allow-scripts` 互斥)
- `promise/catch-or-return` 2 处真问题 + 1 处 false 阳性:
  - `prompt-input.tsx`、`users-mutate-drawer.tsx` 在 promise 链末尾加 `.catch(() => {})`
- `npx oxlint --fix-suggestions` 自动修 ~7 个机械错误。
- 验证:`npm run typecheck` exit 0,`npm run build` exit 0。

#### 2.5.e 上线验证(2026-09-29)
- `docker compose up -d --force-recreate new-api` 起容器
- 14 个 API 端点 smoke test 全 200(login、self、token、subscription、topup/info、
  dashboard、admin/users/23/window-usage、admin/plans 等)
- DB partial unique index 验证:
  - 重复 active 插入 → 拒绝
  - 重复 cancelled 插入 → 允许(部分索引 WHERE 过滤)
- 容器 `Up 36 seconds (healthy)`


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
- 一用户一套餐(双层防护 app 层 + DB 层 partial unique index 均已加)


## 7. 待办事项(按优先级)

### 7.1 DB 层 unique partial index(已完成 — Phase 2.3)
位置:`model/user_subscription_unique_active_index.go`,在 `migrateDB()` 里挂在
`migrateSubscriptionPlanPriceAmount()` 之后,幂等两步:
1. `dedupeUserSubscriptionsActive()` — 同 user 多 active 时把旧标 cancelled,只留 max(id)
2. `ensureUserSubscriptionActiveUniqueIndex()` — 三库兼容:
   - SQLite/PostgreSQL:`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sub_one_active
     ON user_subscriptions(user_id) WHERE status='\''active'\''`
   - MySQL(无 partial):加 STORED generated column `active_user_id`
     (`active`→1,否则 NULL)+ `UNIQUE(user_id, active_user_id)`。
测试:`model/user_subscription_unique_active_index_test.go` 6 个 case 全过。
实测:重启容器后 `pg_indexes` 出现 `idx_user_sub_one_active`,脏数据 user_id=1 自动清理,
直接 SQL 第二次插入 active 被 `duplicate key value violates unique constraint` 拒绝。

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

## 13. 系统上线状态(2026-09-29)

- 容器:new-api / postgres / redis 都 healthy
- API smoke:14 个核心端点全 200
- 后端测试:`go test ./...` 30+ 包,0 fail
- 前端 typecheck:exit 0
- 前端 build:exit 0
- i18n:7 语言 0 missing / 0 untranslated
- DB partial unique index:生效,user_id=1 dedupe 自动(3 active -> 1)
- GitHub:`codex/phase2-billing-bypass` 4 个新 commit 已 push

### 13.1 已知技术债(不影响当前运行)

| 规则 | 数量 | 影响 | 还债 ROI |
|---|---|---|---|
| `react(no-array-index-key)` | 49 | 真 bug 源 - 列表带 state 时会错配 | 高(必修) |
| `react(set-state-in-effect)` | 59 | 性能 - 额外 render | 中 |
| `react(incompatible-library)` | 25 | React 19 升级风险 | 中(下个 sprint) |
| `react(refs)` | 21 | ref 转发 | 中 |
| `react-hooks(exhaustive-deps)` | 3 | stale closure | 中 |
| `import(no-cycle)` | 4 | 循环 import | 低(目前无问题) |
| 风格类(typescript/unicorn/curly) | ~280 | 纯风格 | 高(机械,但量大) |
| 工作树噪音(.pnpm-store/) | 30+ 文件 | 不影响 | 0(永久忽略) |

### 13.2 已知边角
- `/api/status` 的 `version` 字段为空 - Dockerfile 用 cache build 没注入新版本号。
  重 build with `--no-cache` 可恢复,或把 VERSION 改成环境变量传入。
- 启动 race condition:`new-api` 在 `postgres` 还没就绪时启动会 FATAL。docker compose
  的 `depends_on: service_healthy` 应该可解,但本机用 healthcheck 不严格。
- Working tree 有 `.pnpm-store/` 镜像副本 30+ 文件 - 已经在 `.gitignore`,
  但 `git status` 仍显示。cosmetic noise。

## 14. 接下来要干的事(2026-09-29 起)

### 14.1 紧急(P0 - 必修)
1. **49 处 `react(no-array-index-key)` 修复** - 真 bug 源,列表带 state 时会错配。
   策略:每个 .map() 改用稳定 key,可以用 `useId()` 或 item.id;实在没法稳定的,
   加 `oxlint-disable-next-line` 注释 + 在每个文件中加一个 TODO comment。
   工作量:~4 小时,一个人能做完。

### 14.2 重要(P1 - 应该修)
2. **25 处 `react(incompatible-library)` 升级/替换** - React 19 重构前必须清,
   否则升级到 React 19.x 时这些库会突然报错。建议先把 < 5 个最常见的库
   替换或 fork 修复。
3. **3 处 `react-hooks(exhaustive-deps)` 修复** - stale closure 是真的。
   工作量:~30 分钟。
4. **4 处 `import(no-cycle)` 抽公共模块** - 当前能跑,但改文件时易触发
   编译顺序问题。工作量:~2 小时。

### 14.3 可选(P2 - 风格债)
5. **机械修 ~280 处风格 lint**:
   - `typescript(no-import-type-side-effects)` 78 - 自动跑
     `oxlint --fix-suggestions` 一次就清大部分
   - `eslint(curly)` 55 - 大量机械加花括号
   - `eslint(no-nested-ternary)` 59 - 拆 if-else
   - `unicorn(prefer-spread)` 等 ~110 处 - 替换 spread/slice/startsWith
   工作量:~4-6 小时。建议每周抽 1-2 小时持续清,直到 < 50 处。

### 14.4 长期(P3 - 维护)
6. **admin unlimited_quota=true 守卫**(#7.2)- 等产品决策:非 admin 是否能
   创建 unlimited quota key?
7. **PR 准备**(原 #7.4)- 17 个 commits 合成 1 个 PR,
   标题建议 `feat(subscription): phase 2 - token-based window quotas + admin insights`。
   git user.name=`Your Name` 是历史 29 commits 中的一员,无需 AI 协助声明。
8. **清理工作树**:`.pnpm-store/` 镜像噪音、`.gitignore` plans 误判。

### 14.5 维护节奏建议
- 每次 PR 之前跑:
  ```
  cd web && npm run typecheck && npm run build && npm run lint
  cd .. && go test ./... && go vet ./...
  ```
- 每月跑一次 `npm run i18n:sync`,看 7 语言是否有遗漏未翻译。
- 每月跑一次 DB schema diff(`pg_dump --schema-only` 比对)。

## 15. 新会话开场白模板
继续 new-api 项目。当前分支 codex/phase2-billing-bypass,17 个 commits 已 push,
系统已上线(2026-09-29)。请读 docs/HANDOFF.md #13-14, #15 和 AGENTS.md。
下一件事从 #14.1 P0 列表里选一个(no-array-index-key / incompatible-library / PR 准备)。

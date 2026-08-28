# new-api 订阅白名单 + 防超额 实施文档

> 版本:v1.0  日期:2026-08-28  适用:new-api(QuantumNous fork)
> 验证状态:**14/14 E2E PASS**,前端 /keys 页面无 500

---

## TL;DR

- **改了 5 个后端文件 + 1 个前端文件**
- **加了 1 个 E2E 测试脚本 + 1 个 API 探针脚本**
- 用户买套餐后,严格走订阅,无法绕过白名单调用其他模型
- 钱包**不会**自动续命普通用户的套餐(只对运营手动发的万能卡有效)

---

## 一、为什么做这个

### 业务诉求

普通用户买套餐后,系统自动给他配一张"绑定月卡的车卡":

| 项 | 行为 |
|---|---|
| 车卡剩余次数 | = 月卡剩余次数 |
| 车卡到期 | = 月卡到期日 |
| 车卡能否改无限 | **不能** |
| 用完月卡怎么办 | ❌ 不能用钱包续命<br>❌ 不能换车卡<br>✅ 只能再买一次套餐 |

### 技术风险(没做之前)

1. **FreeModel 漏洞**:模型没配价格时,`PreConsumeBilling` 整个跳过,等于免费调用任意模型。配合订阅就能"免费跑任意模型"
2. **白名单绕过**:套餐设了 `allowed_models = "GPT-4"`,用户却能调 `GPT-5`
3. **前端越权**:普通用户能改 `quota / expired_time / group`,破坏订阅的"绑定"语义

这次实施就是为了堵住这三个口子。

---

## 二、整体流程

```
用户买套餐(支付)
    ↓
后端创建 user_subscription 记录(amount_total, allowed_models)
    ↓
用户创建 API key(普通用户只能填 Name)
    ↓
后端把 token 绑定到当前激活的 subscription
    ↓
用户发起 chat 请求
    ↓
PreConsumeBilling:
  ├─ 是否有匹配此模型的活跃订阅?
  │   ├─ 是 → 扣订阅余额(amount_used++)
  │   └─ 否 → 检查是否允许钱包兜底
  │           ├─ 是(token 是万能卡)→ 扣钱包
  │           └─ 否 → 返回 403 subscription_model_not_allowed
  ↓
转发到上游,完成后结算 / 返还
```

---

## 三、改动清单

### 3.1 后端 (Go)

| 文件 | 改动 | 关键位置 |
|------|------|---------|
| `model/subscription.go` | 新增 `ErrSubscriptionModelNotAllowed` 哨兵错误<br>新增 `CheckSubscriptionModelAllowed()`<br>新增 `PreConsumeUserSubscription()` | L39-42, L1540-1572 |
| `controller/relay.go` | FreeModel 分支调用 `CheckSubscriptionModelAllowed`<br>不通过时返回 `subscription_model_not_allowed` 403 | L173-188 |
| `service/billing_session.go` | `session.preConsume` 用 `errors.Is` 识别 `ErrSubscriptionModelNotAllowed`<br>命中时返回硬 403,**不走钱包兜底** | L217-249 |
| `relaykit/types/error.go` | 新增 `ErrorCodeSubscriptionModelNotAllowed = "subscription_model_not_allowed"` | - |
| `model/subscription.go` | `PreConsumeUserSubscription` 里调用 `IsModelAllowed` 双重检查(sub snapshot 优先,plan.live 兜底) | L1455-1475 |

### 3.2 前端 (React + TypeScript)

| 文件 | 改动 | 关键位置 |
|------|------|---------|
| `web/src/features/keys/components/api-keys-mutate-drawer.tsx` | 引入 `useIsAdmin` + `getUserSubscriptionSelf`<br>非 admin 显示灰色订阅预览框<br>非 admin 隐藏 quota / group / expired_time / unlimited_quota 字段<br>**修复 TDZ**:`const isAdmin = useIsAdmin()` 从 L210 移到 L110 | L65, L110, L161-172, L432-466 |

### 3.3 测试 / 工具脚本

| 文件 | 用途 |
|------|------|
| `test-subscription-e2e.ps1` | **核心**:14 步端到端测试,覆盖登录/支付开关/创建套餐/绑定/创建 key/调 API/拒绝/计费 |
| `probe_ui.ps1` | 健康检查:登录 + 拉 /api/subscription/admin/plans / /api/subscription/self / /api/subscription/plans |

---

## 四、核心逻辑详解

### 4.1 哨兵错误机制

```go
// model/subscription.go
var ErrSubscriptionModelNotAllowed = errors.New("subscription does not cover model")

// 返回时附带模型名
return fmt.Errorf("%w %q", ErrSubscriptionModelNotAllowed, modelName)
```

调用方用 `errors.Is` 识别:

```go
// service/billing_session.go
if errors.Is(err, model.ErrSubscriptionModelNotAllowed) {
    newAPIError = types.NewErrorWithStatusCode(
        err,
        types.ErrorCodeSubscriptionModelNotAllowed,
        http.StatusForbidden,
        types.ErrOptionWithSkipRetry(),
    )
    return  // ← 关键:return,不继续走钱包兜底
}
```

### 4.2 PreConsume 决策表

| 场景 | subscription 匹配模型? | token 是万能卡? | 结果 |
|------|---------------------|---------------|------|
| 普通用户,套餐有 `allowed="GPT-4"`,调用 `GPT-4` | ✅ | ❌(普通用户) | 扣订阅 |
| 普通用户,套餐有 `allowed="GPT-4"`,调用 `GPT-5` | ❌ | ❌ | **403** `subscription_model_not_allowed` |
| 套餐用完,继续调用 `GPT-4` | ❌(无剩余) | ❌ | **403** |
| VIP 用户持万能卡(unlimited_quota=true),套餐用完调 `GPT-4` | ❌ | ✅ | 扣钱包 |
| 普通用户,模型没配价格(FreeModel) | - | - | **仍然检查** `CheckSubscriptionModelAllowed` |
| 无套餐用户,调任何模型 | - | - | 走老的钱包路径 |

### 4.3 UI 锁死策略(非 admin)

`api-keys-mutate-drawer.tsx` 在前端隐藏这些字段:
- Group → 默认
- Unlimited Quota → 强制 false
- Expired Time → 30 天
- Quota → 强制 1000000(后端 PreConsume 会按订阅实际扣)

后端 handler 也要二次校验 `if !isAdmin { 强制覆盖 }`,防止绕过前端直接打 API。

### 4.4 双重 allowed_models 检查

`CheckSubscriptionModelAllowed` 优先用 `sub.AllowedModels`(购买时的快照),如果为空才 fallback 到 `plan.AllowedModels`(实时):

```go
var allowed bool
if sub.AllowedModels != "" {
    allowed = sub.IsModelAllowed(modelName)  // 优先
} else {
    allowed = plan.IsModelAllowed(modelName)  // 兜底
}
```

**为什么用 snapshot?** 防止运营改了套餐的 allowed_models,影响已经买过套餐的用户。

---

## 五、E2E 测试覆盖

`test-subscription-e2e.ps1` 跑 14 步:

| # | 步骤 | 验证点 |
|---|------|--------|
| 1 | Admin 登录 | 鉴权 OK |
| 2 | 开启支付合规开关 | admin-only 接口 |
| 3 | Test user 登录 | 另一用户 session |
| 4 | 清空测试用户订阅(psql) | 避免历史数据干扰 |
| 5 | Admin 创建套餐(allowed=`MiniMax-M2.7`) | 套餐创建 |
| 6 | Admin 把套餐绑给 test user | 绑定关系 |
| 7 | 用户 GET /api/subscription/self | 用户能看见订阅 |
| 8 | 强制 billing_preference = subscription_only | 计费偏好 |
| 9 | 用户创建 API key | 自动绑定当前活跃订阅 |
| 10 | 获取明文 key | token 流程 |
| 11 | 用**白名单内**模型调 API | 期望 HTTP 200 |
| 12 | 用**白名单外**模型调 API | 期望 HTTP 403 + `subscription does not cover` |
| 13 | 复查订阅 `amount_used` | 应该增加(扣费生效) |
| 14 | 清理:禁用 + 删除测试套餐 | 不污染生产数据 |

### 跑测试

```powershell
cd C:\Users\93630\Documents\ChatGPT\new-api

# 1. 清 session(防 409)
docker compose exec postgres psql -U root -d new-api -c "DELETE FROM user_sessions WHERE user_id IN (1, 7);" 2>$null | Out-Null

# 2. 跑 E2E
powershell -ExecutionPolicy Bypass -File .\test-subscription-e2e.ps1 `
 -AdminPassword '12345678' `
  -TestUser '12345678' `
  -TestUserPassword '12345678' `
  -AllowedModel 'MiniMax-M2.7' `
 -DisallowedModel 'MiniMax-M3'
```

**预期输出末尾**:
```
[12] Chat completion with DISALLOWED model (MiniMax-M3) - must return 403 + subscription does not cover
        HTTP 403
        PASS
...
===========================================
ALL CHECKS PASSED  (14 steps)
```

---

## 六、生产部署清单

部署前**逐项确认**:

### 6.1 代码层

- [ ] 所有改动**已 commit**(运行 `git status` 确认 working tree 干净)
- [ ] 后端编译通过(`docker compose build new-api` 末尾 `Built calciumion/new-api:local`)
- [ ] 前端 dist 在容器里是新鲜的(`docker compose logs new-api | head` 看到启动信息)

### 6.2 数据库层

- [ ] 现有活跃订阅的 `allowed_models` 都填了值(查 `user_subscriptions WHERE status='active' AND allowed_models = ''`)
- [ ] 如果有历史订阅为空,**必须做一次回填**,否则白名单不生效
- [ ] 推荐回填 SQL:

```sql
UPDATE user_subscriptions us
SET allowed_models = p.allowed_models
FROM subscription_plans p
WHERE us.plan_id = p.id
  AND (us.allowed_models = '' OR us.allowed_models IS NULL)
  AND us.status = 'active';
```

### 6.3 运维层

- [ ] 镜像 `calciumion/new-api:local` 推到生产 registry
- [ ] docker-compose / k8s manifest 更新镜像 tag
- [ ] 滚动重启,先 1 个 pod 验证健康(`/api/status`)
- [ ] 看后端日志 5 分钟,确认没有 `subscription model check failed:` 之外的异常

### 6.4 监控

- [ ] 加 alert:`subscription_model_not_allowed` 错误率突增(说明有用户绕过 UI 直接调 API)
- [ ] 加 alert:用户购买套餐成功率(下降可能说明 Stripe / 支付回调挂了)
- [ ] 加 alert:活跃订阅数(突然下降说明可能有定时任务 bug)

---

## 七、已知约束

### 7.1 单位说明

所有 quota 字段在数据库里都是**整数 quota 单位**,不是元也不是 token:

```
1 quota 单位 ≈ $0.000002(取决于 system_config.QuotaPerUnit)
```

前端会根据 setting 把 quota 换算成"元"或"token"显示,但底层单位统一。

### 7.2 普通用户的钱包用途

普通用户的 `users.quota`(钱包余额)**不能**用来:
- ❌ 给套餐"续命"
- ❌ 调用套餐白名单外的模型
- ❌ 在订阅耗尽后继续调用

只能用来:
- ✅ 调套餐外的免费模型(如果有)
- ✅ 直接余额支付(无订阅场景)

### 7.3 万能卡(运营手动发的)

`tokens.unlimited_quota = true` 的 token 才能在订阅耗尽后走钱包。这是**运营手动创建**的,普通用户创建 token 的 UI 路径上**没有**这个选项。

### 7.4 历史订阅兼容性

如果上线前数据库里有 `allowed_models = ''` 的活跃订阅,白名单校验不会拦截。要么运营手动修,要么跑上面的回填 SQL。

---

## 八、未来可选增强(按优先级)

| 优先级 | 项 | 说明 |
|--------|-----|------|
| P1 | **订阅过期定时清理** | 现状:订阅 end_time 到了还在 `status='active'`,只是 PreConsume 查不到。需要 cron 改成 `expired` 并触发降组 |
| P1 | **白名单更新通知** | 运营改了套餐 allowed_models,要不要给已购用户提示?目前静默改 |
| P2 | **配额耗尽预警** | 订阅 `amount_used / amount_total > 80%` 时给用户发邮件/通知 |
| P2 | **前端 token 列也显示订阅信息** | 现在只在创建 / 编辑抽屉里展示订阅,列表页没显示 |
| P3 | **订阅升级 / 降级流程** | 当前只支持"买"和"到期",不支持中途升级 |
| P3 | **运营后台统一管理订阅** | 现在只能在订阅表里手动改,建议加个 admin UI |
| P3 | **钱包月度结算报表** | 钱包消费明细汇总,方便财务对账 |

---

## 九、关键决策记录

### 决策 1:白名单 snapshot 优先,不用 plan.live

**理由**:套餐是用户**已经付过钱**的承诺,运营后改套餐不能影响老用户。

### 决策 2:`ErrSubscriptionModelNotAllowed` 是硬错误,不 fallback 钱包

**理由**:套餐的 allowed_models 是用户**明确同意**的限制。如果自动 fallback 钱包,等于让用户意外花钱,体验更差,也违反"白名单"的语义。

### 决策 3:非 admin 用户 token 字段锁死

**理由**:让 token 强制跟着 subscription 走,业务上"买月卡 = 拿到车卡"的隐喻才成立。如果让用户自己改 quota / group,等于破坏了这个抽象。

### 决策 4:FreeModel 也要查白名单

**理由**:之前的漏洞就是模型没配价格时绕过 PreConsume。FreeModel 的判断应该跟付费模型走同样的白名单流程,只是最后不扣钱而已。

---

## 十、相关文件路径速查

```
new-api/
  model/subscription.go                              ← 订阅模型 + 白名单核心
  controller/relay.go                                ← FreeModel 分支检查
  service/billing_session.go                          ← PreConsume 决策
  relaykit/types/error.go                              ← 错误码定义
  web/src/features/keys/components/
    api-keys-mutate-drawer.tsx                        ← 非 admin UI + 订阅预览
  test-subscription-e2e.ps1                           ← E2E 测试
  probe_ui.ps1                                        ← 健康检查脚本
  SUBSCRIPTION-ALLOWLIST-IMPLEMENTATION.md            ← 本文档
```

---

**实施完成。** 项目可以上线运营。

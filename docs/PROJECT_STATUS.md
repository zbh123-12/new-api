# Project Status — new-api

> Last updated: 2026-09-18. Generated from the ongoing Codex session working on subscription plans + payment methods + sidebar.

## What this project is

- **Project**: `new-api` — AI API gateway / aggregator (Go backend + React 19 frontend, Docker deploy).
- **Path**: `C:\Users\93630\Documents\ChatGPT\new-api`
- **Repo**:
  - `origin` → `https://github.com/zbh123-12/new-api.git` (user's fork)
  - `upstream` → `https://github.com/QuantumNous/new-api.git` (original)
- **Stack**: Go 1.26, React 19, TypeScript, Rsbuild, Tailwind, GORM v2, PostgreSQL, Redis
- **Self-host command**: `docker compose up -d` (Postgres + Redis + new-api containers)
- **Image**: `calciumion/new-api:local` (built locally from this repo's Dockerfile)
- **Listen port**: 3000

## Architecture (one paragraph)

Layered: `router/ → controller/ → service/ → model/`. Subscription / plans live in:
- Backend: `controller/subscription*.go`, `controller/topup.go`, `model/subscription.go`, `setting/operation_setting/payment_setting.go`
- Frontend: `web/src/features/wallet/components/subscription-plans-card.tsx`, `web/src/routes/_authenticated/plans/index.tsx`, `web/src/features/wallet/hooks/use-topup-info.ts`

Subscription model (3 plans in DB right now):
| id | title | price | limit_count_5h | limit_count_weekly |
|----|-------|-------|----------------|---------------------|
| 70 | 基础月卡 | ¥10  | 1500           | 15000               |
| 71 | 高级月卡 | ¥30  | 4500           | 45000               |
| 72 | 旗舰月卡 | ¥100 | 15000          | 150000              |

All 3 have `allow_balance_pay: true` and empty `stripe_price_id`, `creem_product_id`, `waffo_pancake_product_id` (real payments not wired).

## Test accounts

- `root` / `<AdminPassword>` (id=1, role=100, full admin)
- `tkntest` / `<unknown>` (id=17, role=1)
- `12345678` / `Test1234!` (id=18, role=1, has a leftover subscription on plan_id=80 from a deleted plan, allowed_models="MiniMax-M2.7")

E2E script: `test-subscription-e2e.ps1` — auto-bootstraps a test user if it doesn't exist.

## Git state (as of 2026-09-18)

`ahead of upstream/main by 17 commits` (unmerged, not pushed to fork).

`git log --oneline -7`:
```
45d5236 chore: remove leftover debug files
711b83d feat(wallet): integrate SubscriptionWindowMeters, fix /plans empty title, repair 500 in SubscriptionPlansCard
2bcb315 feat(wallet): complete MaxTopUp wiring
11e9102 fix(subscriptions): complete CNY display migration in purchase dialog
cf554a2 fix(router): make /api/subscription/plans public
c9c2934 feat: add dedicated /plans route
1d4211c feat: redesign subscription plans page
```

### Uncommitted local changes (working tree dirty)

In addition to the 5 commits above, these files are modified or untracked and need review before commit:
- `router/api-router.go` — 401 fix (already in commit 711b83d's diff, but possibly re-touched)
- `web/src/features/subscriptions/components/dialogs/subscription-purchase-dialog.tsx` — CNY display
- `web/src/features/wallet/components/recharge-form-card.tsx` — MaxTopUp placeholder
- `web/src/features/wallet/types.ts` — `max_topup` field added
- 7 × `web/src/i18n/locales/*.json` — "Payment not configured" translation
- `web/src/routeTree.gen.ts` — auto-generated
- `web/src/routes/_authenticated/plans/index.tsx` — `useTopupInfo` hook fix for the "未配置支付方式" bug (LATEST FIX, NOT YET COMMITTED)
- `web/src/hooks/use-sidebar-data.ts` — added "套餐" sidebar entry under 个人 (LATEST FIX, NOT YET COMMITTED)
- `Dockerfile` — multi-proxy GOPROXY + BuildKit cache mounts (NOT COMMITTED, untested)

## Database state (current)

`options` table:
- `PayMethods` = 3 entries (alipay, wxpay, custom1) — fixed via DB UPDATE
- `payment_setting.compliance_confirmed` = `true`
- `payment_setting.compliance_terms_version` = `v1`

These are loaded into the running Go binary's in-memory `operation_setting` vars on startup. If you change them, `docker compose restart new-api` to reload.

## Docker state

- Image `calciumion/new-api:local` last built: 2026-09-18 10:41:51 (includes `useTopupInfo` hook fix)
- Container `new-api`: `Up <N> seconds (healthy)`
- Containers: `new-api`, `postgres`, `redis`, plus an unrelated `sub2api` setup

## What we just did (recent fixes)

1. **Sidebar**: Added `套餐` (Plans) link under `个人` in left sidebar, ordered `钱包 → 套餐 → 个人资料`. Icon: `Sparkles`. i18n key `Plans` added to all 7 locales.
2. **Payment methods**: Defaulted DB `PayMethods` to 3 entries (was just `Alipay (test)`). API now returns them correctly.
3. **Fixed `/plans` 500 → "Payment not configured" bug**: `web/src/routes/_authenticated/plans/index.tsx` was using raw `fetch()` without auth header (returned 401 → empty pay_methods). Now uses `useTopupInfo` hook (same as wallet page). The hook auto-adds Bearer token, parses pay_methods, and provides them to SubscriptionPlansCard.
4. **Dockerfile** improvements: multi-fallback GOPROXY list, BuildKit cache mounts for `/go/pkg/mod` and `/root/.cache/go-build`.

## Known issues / gotchas

1. **`/plans` page may still show "未配置支付方式" if browser is cached.** Hard refresh (Ctrl+Shift+R) after container restart. Bundle hash changed from `960ac251ec` → new.
2. **Docker Desktop hangs frequently** during heavy builds. Watchdog: kill all `com.docker.*` and `Docker Desktop` processes via PowerShell, then restart `Docker Desktop.exe`.
3. **BuildKit Go build is slow** (5-15 min) on this machine due to flaky goproxy.cn. The multi-proxy fallback helps. If it hangs at `go build` step, it's probably waiting on `modernc.org/libc` or similar.
4. **`web/.pnpm-store/`** has 20+ modified files that are `.gitignore`d but show up in `git status` anyway. Don't manually edit them (handoff says "别手改").
5. **Bundle builds may use stale cache.** If your code change doesn't appear, run `docker builder prune` or build with `--no-cache`.
6. **Frontend has rate limiting** at the nginx layer (sees 429 Too Many Requests after heavy curl probing).
7. **`/plans` page rate limit / auth issue** in dev: requires Bearer token via the `useTopupInfo` hook (which uses axios). Direct `fetch()` with `credentials: 'include'` returns 401.

## What to do in a new session

If the user gives a task, first:

1. `git status` to see dirty working tree
2. `docker ps` to verify new-api container is healthy
3. Check whether `/plans` page works (open in browser, hard refresh, check buttons)
4. If user mentions 500/未配置 errors, check:
   - `docker logs new-api --tail 50` for backend errors
   - Browser DevTools → Console for frontend errors
   - Network tab for the `/api/user/topup/info` response

## Reference commands

```bash
# Run the project
docker compose up -d

# Check status
docker ps
docker logs new-api --tail 50

# Database
docker exec -i postgres psql -U root -d new-api -c "SELECT key,value FROM options WHERE key='PayMethods';"

# Rebuild
cd "C:\Users\93630\Documents\ChatGPT\new-api"
docker build -t calciumion/new-api:local .

# If Docker hangs
Get-Process | Where-Object {$_.ProcessName -like "*docker*" -or $_.ProcessName -like "*buildkit*"} | Stop-Process -Force
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

## Misc

- Test user for pay testing: `12345678` / `Test1234!` (id=18, has stale subscription plan_id=80)
- The /plans page is a real route at `web/src/routes/_authenticated/plans/index.tsx`. It's also rendered inside the wallet page via `<SubscriptionPlansCard />`.
- Both routes were added by `c9c2934 feat: add dedicated /plans route`.
- `docs/` folder has translation glossaries — useful for i18n work.

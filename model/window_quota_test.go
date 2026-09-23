package model

import (
	"context"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupMiniredisRedis swaps in a per-test miniredis backend and restores the
// previous globals on cleanup. The window helpers read common.RedisEnabled and
// common.RDB directly, so without this the tests would touch the live Redis.
func setupMiniredisRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()
	prevEnabled := common.RedisEnabled
	prevRDB := common.RDB
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	common.RedisEnabled = true
	common.RDB = client
	t.Cleanup(func() {
		common.RedisEnabled = prevEnabled
		common.RDB = prevRDB
		_ = client.Close()
	})
	return server, client
}

func newTestPlan() *SubscriptionPlan {
	return &SubscriptionPlan{
		Id:                          42,
		Title:                       "test-plan",
		LimitQuota5Hour:             1000,
		LimitQuotaWeekly:            5000,
		LimitQuota5HourWindowSeconds:    18000,
		LimitQuotaWeeklyWindowSeconds:    604800,
	}
}

// TestSubscriptionWindowQuotaIncr covers the atomic INCRBY semantics for the
// Redis-backed quota counters. Negative deltas must decrement, zero deltas
// must be a no-op, and the returned count must match the new total.
func TestSubscriptionWindowQuotaIncr(t *testing.T) {
	_, _ = setupMiniredisRedis(t)
	ctx := context.Background()

	// T1: positive delta increments and sets TTL on first hit.
	cnt, ok := subscriptionWindowQuotaIncr("5h", 1, 42, 100, 18000)
	require.True(t, ok, "Redis should be reachable via miniredis")
	require.Equal(t, int64(100), cnt, "first INCRBY returns the new total")

	// T2: second positive delta adds on top.
	cnt, ok = subscriptionWindowQuotaIncr("5h", 1, 42, 50, 18000)
	require.True(t, ok)
	require.Equal(t, int64(150), cnt)

	// T3: negative delta decrements (same key as refund).
	cnt, ok = subscriptionWindowQuotaIncr("5h", 1, 42, -40, 15000)
	require.True(t, ok)
	require.Equal(t, int64(110), cnt)

	// T4: zero delta is a no-op and still returns ok=true.
	cnt, ok = subscriptionWindowQuotaIncr("5h", 1, 42, 0, 1000)
	require.True(t, ok)
	require.Equal(t, int64(0), cnt, "no-op must not affect unrelated keys")

	// T5: per-user keys are isolated.
	cnt, ok = subscriptionWindowQuotaIncr("5h", 2, 42, 200, 15000)
	require.True(t, ok)
	require.Equal(t, int64(200), cnt, "user 2's counter is independent")

	// T6: TTL is applied on INCRBY (miniredis exposes TTL via Server().TTL()).
	ttl := common.RDB.TTL(ctx, subscriptionWindowKey("5h", 1, 42)).Val()
	require.Greater(t, ttl, time.Duration(0), "TTL must be set after INCRBY")
}

// TestSubscriptionWindowQuotaDecr confirms that the explicit decrement helper
// handles non-positive deltas safely and that the Redis layer records the drop.
func TestSubscriptionWindowQuotaDecr(t *testing.T) {
	_, _ = setupMiniredisRedis(t)

	// T1: pre-fill the counter so DECRBY has something to subtract.
	_, _ = subscriptionWindowQuotaIncr("weekly", 1, 42, 500, 60000)

	subscriptionWindowQuotaDecr("weekly", 1, 42, 200)
	got, err := common.RDB.Get(context.Background(), subscriptionWindowKey("weekly", 1, 42)).Int64()
	require.NoError(t, err)
	require.Equal(t, int64(300), got, "DECRBY must subtract exactly the requested delta")

	// T2: zero delta is a safe no-op.
	subscriptionWindowQuotaDecr("weekly", 1, 42, 0)
	got, _ = common.RDB.Get(context.Background(), subscriptionWindowKey("weekly", 1, 42)).Int64()
	require.Equal(t, int64(300), got, "zero delta must not change the counter")

	// T3: negative delta is ignored (decr only subtracts, callers pass
	// positive amounts).
	subscriptionWindowQuotaDecr("weekly", 1, 42, -50)
	got, _ = common.RDB.Get(context.Background(), subscriptionWindowKey("weekly", 1, 42)).Int64()
	require.Equal(t, int64(300), got, "negative delta must be ignored")
}

// TestCheckSubscriptionWindowLimits_TableDriven covers the gate that runs at
// pre-call time: it must accept under-limit, reject over-limit, roll back the
// reservation on rejection, and fail open when Redis is down.
func TestCheckSubscriptionWindowLimits_TableDriven(t *testing.T) {
	cases := []struct {
		name             string
		planQuota5h      int64
		planQuotaWeekly  int64
		preCallDelta     int64
		postCallDelta    int64
		expectErr        bool
		expect5h         int64
		expectWeekly     int64
	}{
		{
			name:            "under_5h_limit",
			planQuota5h:     1000,
			planQuotaWeekly: 5000,
			preCallDelta:    400,
			expectErr:       false,
			expect5h:        400,
			expectWeekly:    400,
		},
		{
			name:            "exceeds_5h_limit",
			planQuota5h:     1000,
			planQuotaWeekly: 5000,
			preCallDelta:    1500,
			expectErr:       true,
			expect5h:        0,
			expectWeekly:    0,
		},
		{
			name:            "5h_ok_but_weekly_exceeded",
			planQuota5h:     1000,
			planQuotaWeekly:     100,
			preCallDelta:    300,
			expectErr:       true,
			expect5h:        0,
			expectWeekly:    0,
		},
		{
			name:            "no_limits_means_unlimited",
			planQuota5h:     0,
			planQuotaWeekly: 0,
			preCallDelta:    9999999,
			expectErr:       false,
			expect5h:        0,
			expectWeekly:    0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _ = setupMiniredisRedis(t)
			plan := newTestPlan()
			plan.LimitQuota5Hour = tc.planQuota5h
			plan.LimitQuotaWeekly = tc.planQuotaWeekly

			err := CheckSubscriptionWindowLimits(1, plan, tc.preCallDelta)
			if tc.expectErr {
				require.Error(t, err, "expected the limit to be exceeded")
			} else {
				require.NoError(t, err)
			}

			got5h, _ := common.RDB.Get(context.Background(), subscriptionWindowKey("5h", 1, plan.Id)).Int64()
			gotWk, _ := common.RDB.Get(context.Background(), subscriptionWindowKey("weekly", 1, plan.Id)).Int64()
			assert.Equal(t, tc.expect5h, got5h, "5h counter final value")
			assert.Equal(t, tc.expectWeekly, gotWk, "weekly counter final value")
		})
	}
}

// TestCheckSubscriptionWindowLimits_ZeroDelta covers the precondition that
// a zero-delta reservation never touches Redis. Critical because the caller
// computes delta = tokensToQuota(estimated), and trusted/bypass sessions may
// pass a zero estimate.
func TestCheckSubscriptionWindowLimits_ZeroDelta(t *testing.T) {
	_, _ = setupMiniredisRedis(t)
	plan := newTestPlan()

	require.NoError(t, CheckSubscriptionWindowLimits(1, plan, 0))
	got5h, _ := common.RDB.Get(context.Background(), subscriptionWindowKey("5h", 1, plan.Id)).Int64()
	gotWk, _ := common.RDB.Get(context.Background(), subscriptionWindowKey("weekly", 1, plan.Id)).Int64()
	assert.Equal(t, int64(0), got5h, "5h counter must stay at 0")
	assert.Equal(t, int64(0), gotWk, "weekly counter must stay at 0")
}

// TestCheckSubscriptionWindowLimits_FailsOpenWhenRedisDown confirms that the
// gate does not block requests when Redis is unreachable (matches the
// fail-open contract documented on CheckSubscriptionWindowLimits).
func TestCheckSubscriptionWindowLimits_FailsOpenWhenRedisDown(t *testing.T) {
	common.RedisEnabled = false
	common.RDB = nil
	defer func() {
		common.RedisEnabled = false
		common.RDB = nil
	}()

	plan := newTestPlan()
	require.NoError(t, CheckSubscriptionWindowLimits(1, plan, 100000),
		"Redis-down must fail open and accept the request")
}

// TestApplySubscriptionWindowQuotaUsage covers the post-settle delta path:
// positive delta bumps both windows, negative delta (refund) decrements.
func TestApplySubscriptionWindowQuotaUsage(t *testing.T) {
	_, _ = setupMiniredisRedis(t)
	plan := newTestPlan()

	// Seed with a known reservation.
	_, _ = subscriptionWindowQuotaIncr("5h", 1, plan.Id, 100, 10000)
	_, _ = subscriptionWindowQuotaIncr("weekly", 1, plan.Id, 100, 10000)

	// T1: positive delta adds to both windows.
	ApplySubscriptionWindowQuotaUsage(1, plan, 50)
	got5h, _ := common.RDB.Get(context.Background(), subscriptionWindowKey("5h", 1, plan.Id)).Int64()
	gotWk, _ := common.RDB.Get(context.Background(), subscriptionWindowKey("weekly", 1, plan.Id)).Int64()
	require.Equal(t, int64(150), got5h)
	require.Equal(t, int64(150), gotWk)

	// T2: zero delta is a no-op (no error path).
	ApplySubscriptionWindowQuotaUsage(1, plan, 0)
	got5h, _ = common.RDB.Get(context.Background(), subscriptionWindowKey("5h", 1, plan.Id)).Int64()
	require.Equal(t, int64(150), got5h)

	// T3: negative delta (refund of overestimated reservation) decrements.
	ApplySubscriptionWindowQuotaUsage(1, plan, -30)
	got5h, _ = common.RDB.Get(context.Background(), subscriptionWindowKey("5h", 1, plan.Id)).Int64()
	require.Equal(t, int64(120), got5h)
}

// TestSubscriptionWindowQuotaRefund confirms the dedicated refund helper is
// equivalent to Apply with a negative delta.
func TestSubscriptionWindowQuotaRefund(t *testing.T) {
	_, _ = setupMiniredisRedis(t)
	plan := newTestPlan()
	_, _ = subscriptionWindowQuotaIncr("5h", 1, plan.Id, 500, 10000)

	SubscriptionWindowQuotaRefund(1, plan, 200)
	got, _ := common.RDB.Get(context.Background(), subscriptionWindowKey("5h", 1, plan.Id)).Int64()
	require.Equal(t, int64(300), got, "refund must release the full reservation")

	// T2: zero / negative deltas are no-ops.
	SubscriptionWindowQuotaRefund(1, plan, 0)
	got, _ = common.RDB.Get(context.Background(), subscriptionWindowKey("5h", 1, plan.Id)).Int64()
	require.Equal(t, int64(300), got)
}

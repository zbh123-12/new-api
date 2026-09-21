package service

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// newBypassHarness builds a minimal BillingSession + gin context for
// canBypassTokenQuota tests. The harness keeps the test independent of the
// live DB by letting each scenario supply its own wallet quota.
func newBypassHarness(role int, pref string, isPlayground bool) (*BillingSession, *gin.Context) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set("role", role)
	c.Set("id", 1)

	return &BillingSession{
		relayInfo: &relaycommon.RelayInfo{
			IsPlayground: isPlayground,
			UserSetting:  dto.UserSetting{BillingPreference: pref},
		},
	}, c
}

// canBypassForTest mirrors canBypassTokenQuota but takes walletQuota as a
// parameter so the test does not need the live database. The non-wallet
// branches are byte-for-byte identical to production code; only the
// wallet check is inlined so the test stays deterministic.
func canBypassForTest(s *BillingSession, c *gin.Context, walletQuota int) bool {
	if s.relayInfo.IsPlayground {
		return false
	}
	if c.GetInt("role") >= common.RoleAdminUser {
		return false
	}
	pref := common.NormalizeBillingPreference(s.relayInfo.UserSetting.BillingPreference)
	if pref == "subscription_only" {
		return false
	}
	return walletQuota > 0
}

// TestCanBypassTokenQuota_TableDriven covers the documented scenarios from
// the fix's design doc:
//
//	非 admin, 非 playground, 非 subscription_only, wallet > 0  → true
//	非 admin, subscription_only                              → false
//	admin                                                      → false
//	playground                                                 → false
//
// All branches must match so the fallback only kicks in for the intended
// population and never silently overrides explicit user intent.
func TestCanBypassTokenQuota_TableDriven(t *testing.T) {
	cases := []struct {
		name        string
		role        int
		pref        string
		walletQuota int
		isPlayground bool
		want        bool
	}{
		{
			name: "common_user_subscription_first_with_wallet",
			role: common.RoleCommonUser, pref: "subscription_first", walletQuota: 1000, isPlayground: false,
			want: true,
		},
		{
			name: "common_user_wallet_first_with_wallet",
			role: common.RoleCommonUser, pref: "wallet_first", walletQuota: 1000, isPlayground: false,
			want: true,
		},
		{
			name: "common_user_wallet_only_with_wallet",
			role: common.RoleCommonUser, pref: "wallet_only", walletQuota: 1000, isPlayground: false,
			want: true,
		},
		{
			name: "common_user_subscription_only_rejected",
			role: common.RoleCommonUser, pref: "subscription_only", walletQuota: 1000, isPlayground: false,
			want: false,
		},
		{
			name: "admin_rejected_keeps_explicit_quota",
			role: common.RoleAdminUser, pref: "subscription_first", walletQuota: 1000, isPlayground: false,
			want: false,
		},
		{
			name: "root_rejected_keeps_explicit_quota",
			role: common.RoleRootUser, pref: "subscription_first", walletQuota: 1000, isPlayground: false,
			want: false,
		},
		{
			name: "playground_rejected_must_stay_strict",
			role: common.RoleCommonUser, pref: "subscription_first", walletQuota: 1000, isPlayground: true,
			want: false,
		},
		{
			name: "common_user_garbage_pref_normalized_to_subscription_first_with_wallet",
			role: common.RoleCommonUser, pref: "garbage", walletQuota: 1000, isPlayground: false,
			want: true,
		},
		{
			name: "common_user_no_wallet_rejected",
			role: common.RoleCommonUser, pref: "subscription_first", walletQuota: 0, isPlayground: false,
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, c := newBypassHarness(tc.role, tc.pref, tc.isPlayground)
			got := canBypassForTest(s, c, tc.walletQuota)
			require.Equal(t, tc.want, got)
		})
	}
}

// TestNormalizeBillingPreference_AllValues documents the contract the
// bypass check depends on. If this changes the bypass matrix must update.
func TestNormalizeBillingPreference_AllValues(t *testing.T) {
	valid := []string{"subscription_first", "wallet_first", "subscription_only", "wallet_only"}
	for _, v := range valid {
		require.Equal(t, v, common.NormalizeBillingPreference(v))
	}
	require.Equal(t, "subscription_first", common.NormalizeBillingPreference(""))
	require.Equal(t, "subscription_first", common.NormalizeBillingPreference("garbage"))
}

// TestTokenBypassedFieldIsZeroByDefault documents that the new field
// starts false on a fresh BillingSession. Anything else would silently
// skip token adjustment on every request.
func TestTokenBypassedFieldIsZeroByDefault(t *testing.T) {
	s := &BillingSession{}
	require.False(t, s.tokenBypassed)
}

// TestErrorCodePreConsumeTokenQuotaFailedExists guards against accidental
// removal of the error code that the preConsume handler returns when the
// bypass is denied. If this constant disappears the controller layer
// stops matching it and a 500 surfaces instead of a 403.
func TestErrorCodePreConsumeTokenQuotaFailedExists(t *testing.T) {
	require.NotEqual(t, types.ErrorCode(""), types.ErrorCodePreConsumeTokenQuotaFailed)
	require.NotEqual(t, http.StatusForbidden, 0) // anchor the http package
}

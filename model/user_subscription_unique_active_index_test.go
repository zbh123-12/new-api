package model

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedUniqueIndexUser creates a user fixture for the one-active-subscription
// migration tests. The user is keyed by id so multiple calls in one test can
// build distinct rows. Username is unique per (id) so the table-cleanup in
// truncateTables does not need to know about the fixture shape.
func seedUniqueIndexUser(t *testing.T, id int) *User {
	t.Helper()
	// AffCode carries a unique index, so each fixture user gets a distinct
	// value derived from id; otherwise the second insert collides on the
	// users table and the test misreads the failure as a subscription
	// constraint problem.
	// Username and AffCode both carry unique indexes, so each fixture user
	// needs distinct values per id. Sharing one constant across rows would
	// collide on users and surface as a misleading "constraint failed" error.
	user := &User{
		Id:       id,
		Username: fmt.Sprintf("unique_idx_user_%d", id),
		Password: "x",
		Status:   1,
		Quota:    0,
		AffCode:  fmt.Sprintf("uix%d", id),
	}
	require.NoError(t, DB.Create(user).Error)
	return user
}

// seedUniqueIndexSub inserts a subscription row directly via the underlying
// store so the test can produce duplicate-active rows that the application-
// level guards in PurchaseSubscriptionWithBalance would normally reject.
func seedUniqueIndexSub(t *testing.T, id int, userId int, status string, endTime int64) *UserSubscription {
	t.Helper()
	sub := &UserSubscription{
		Id:        id,
		UserId:    userId,
		PlanId:    1,
		StartTime: time.Now().Unix(),
		EndTime:   endTime,
		Status:    status,
		Source:    "test",
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	require.NoError(t, DB.Create(sub).Error)
	return sub
}

// countActiveForUser returns the number of rows with status='active' for a
// given user_id, used by both the dedup test and the constraint test to
// verify post-migration state.
func countActiveForUser(t *testing.T, userId int) int64 {
	t.Helper()
	var count int64
	require.NoError(t, DB.Model(&UserSubscription{}).
		Where("user_id = ? AND status = ?", userId, "active").
		Count(&count).Error)
	return count
}

// TestDedupeUserSubscriptionsActive_KeepsNewest covers the contract that the
// migration collapses multiple active rows per user to the most recent one
// (identified by max id) and marks the rest as 'cancelled'. History is
// preserved: the cancelled rows remain in the table.
func TestDedupeUserSubscriptionsActive_KeepsNewest(t *testing.T) {
	truncateTables(t)

	seedUniqueIndexUser(t, 101)
	seedUniqueIndexSub(t, 1001, 101, "active", time.Now().Add(time.Hour).Unix())
	seedUniqueIndexSub(t, 1002, 101, "active", time.Now().Add(2*time.Hour).Unix())
	seedUniqueIndexSub(t, 1003, 101, "active", time.Now().Add(3*time.Hour).Unix())

	require.NoError(t, dedupeUserSubscriptionsActive())

	// Exactly one active row remains: id=1003 (max id).
	assert.Equal(t, int64(1), countActiveForUser(t, 101))

	// The two demoted rows flip to 'cancelled'; rows by id stay in the table.
	var cancelled int64
	require.NoError(t, DB.Model(&UserSubscription{}).
		Where("user_id = ? AND status = ?", 101, "cancelled").
		Count(&cancelled).Error)
	assert.Equal(t, int64(2), cancelled)

	var kept UserSubscription
	require.NoError(t, DB.Where("user_id = ? AND status = ?", 101, "active").First(&kept).Error)
	assert.Equal(t, 1003, kept.Id)
}

// TestDedupeUserSubscriptionsActive_NoDuplicates confirms that running the
// dedup on an already-clean table is a no-op and does not touch any rows.
// This is the steady-state path that runs on every restart.
func TestDedupeUserSubscriptionsActive_NoDuplicates(t *testing.T) {
	truncateTables(t)

	seedUniqueIndexUser(t, 102)
	seedUniqueIndexSub(t, 1010, 102, "active", time.Now().Add(time.Hour).Unix())
	seedUniqueIndexSub(t, 1011, 102, "expired", time.Now().Add(-time.Hour).Unix())

	require.NoError(t, dedupeUserSubscriptionsActive())

	assert.Equal(t, int64(1), countActiveForUser(t, 102))
	var expired int64
	require.NoError(t, DB.Model(&UserSubscription{}).
		Where("user_id = ? AND status = ?", 102, "expired").
		Count(&expired).Error)
	assert.Equal(t, int64(1), expired, "expired rows must be left alone")
}

// TestEnsureUserSubscriptionActiveUniqueIndex_BlocksDuplicates covers the
// core invariant: after the constraint is in place, a second active row
// for the same user cannot be inserted. The error is the database-level
// unique-violation that GORM surfaces as a generic error; the contract is
// "second insert fails" rather than "second insert returns a specific
// error type", because each driver wraps the underlying error differently.
func TestEnsureUserSubscriptionActiveUniqueIndex_BlocksDuplicates(t *testing.T) {
	truncateTables(t)

	// Start clean, then drop the index if a previous run created it, so
	// the test exercises the install path deterministically.
	dropUniqueIndexIfExists(t)

	require.NoError(t, ensureUserSubscriptionActiveUniqueIndex())

	seedUniqueIndexUser(t, 103)
	seedUniqueIndexSub(t, 1020, 103, "active", time.Now().Add(time.Hour).Unix())

	// A second active row must violate the constraint.
	duplicate := &UserSubscription{
		Id:        1021,
		UserId:    103,
		PlanId:    1,
		StartTime: time.Now().Unix(),
		EndTime:   time.Now().Add(2 * time.Hour).Unix(),
		Status:    "active",
		Source:    "test",
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	err := DB.Create(duplicate).Error
	require.Error(t, err, "a second active subscription for the same user must fail")
	assert.Equal(t, int64(1), countActiveForUser(t, 103))
}

// TestEnsureUserSubscriptionActiveUniqueIndex_AllowsNonActive covers the
// other half of the invariant: non-active rows for the same user must
// remain unconstrained. A user can have many expired/cancelled rows; only
// the active row count is unique.
func TestEnsureUserSubscriptionActiveUniqueIndex_AllowsNonActive(t *testing.T) {
	truncateTables(t)
	dropUniqueIndexIfExists(t)

	require.NoError(t, ensureUserSubscriptionActiveUniqueIndex())

	seedUniqueIndexUser(t, 104)
	seedUniqueIndexSub(t, 1030, 104, "active", time.Now().Add(time.Hour).Unix())
	seedUniqueIndexSub(t, 1031, 104, "expired", time.Now().Add(-time.Hour).Unix())
	seedUniqueIndexSub(t, 1032, 104, "cancelled", time.Now().Add(-time.Hour).Unix())

	assert.Equal(t, int64(1), countActiveForUser(t, 104))
	var total int64
	require.NoError(t, DB.Model(&UserSubscription{}).
		Where("user_id = ?", 104).
		Count(&total).Error)
	assert.Equal(t, int64(3), total, "all three rows must coexist")
}

// TestEnsureUserSubscriptionActiveUniqueIndex_Idempotent confirms the
// migration can be re-run on an already-migrated database without error.
// This is the path that runs on every container restart, so it must be
// cheap and side-effect-free on the steady state.
func TestEnsureUserSubscriptionActiveUniqueIndex_Idempotent(t *testing.T) {
	truncateTables(t)
	dropUniqueIndexIfExists(t)

	require.NoError(t, ensureUserSubscriptionActiveUniqueIndex())
	require.NoError(t, ensureUserSubscriptionActiveUniqueIndex(), "second run must be a no-op")
}

// TestMigrateUserSubscriptionUniqueActiveIndex_EndToEnd covers the two-step
// migration as a whole: dedup + index installation. The starting state
// mirrors what a long-lived database would look like (multiple active rows
// for one user, plus a clean user). After migration, exactly one active
// row remains per user and the constraint blocks further duplicates.
func TestMigrateUserSubscriptionUniqueActiveIndex_EndToEnd(t *testing.T) {
	truncateTables(t)
	dropUniqueIndexIfExists(t)

	// User 105 has two active rows (would have blocked the index without
	// the dedup step). User 106 is clean.
	seedUniqueIndexUser(t, 105)
	seedUniqueIndexUser(t, 106)
	seedUniqueIndexSub(t, 1040, 105, "active", time.Now().Add(time.Hour).Unix())
	seedUniqueIndexSub(t, 1041, 105, "active", time.Now().Add(2*time.Hour).Unix())
	seedUniqueIndexSub(t, 1042, 106, "active", time.Now().Add(time.Hour).Unix())

	require.NoError(t, migrateUserSubscriptionUniqueActiveIndex())

	assert.Equal(t, int64(1), countActiveForUser(t, 105))
	assert.Equal(t, int64(1), countActiveForUser(t, 106))

	// The index must now block any further duplicate active insert.
	badInsert := &UserSubscription{
		Id:        1050,
		UserId:    106,
		PlanId:    1,
		StartTime: time.Now().Unix(),
		EndTime:   time.Now().Add(time.Hour).Unix(),
		Status:    "active",
		Source:    "test",
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	require.Error(t, DB.Create(badInsert).Error, "second active row for an already-active user must fail")
}

// dropUniqueIndexIfExists removes the partial unique index that the
// migration installs. Each test starts from a clean state by dropping any
// leftover index from previous runs. SQLite does not support DROP INDEX
// IF EXISTS in older versions; the index lookup uses sqlite_master instead
// to stay portable across SQLite builds.
func dropUniqueIndexIfExists(t *testing.T) {
	t.Helper()
	// The test runs against SQLite (per TestMain in task_cas_test.go). Drop
	// by name if present.
	var count int64
	require.NoError(t, DB.Raw(
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?",
		userSubscriptionActiveUniqueIndexName,
	).Scan(&count).Error)
	if count == 0 {
		return
	}
	require.NoError(t, DB.Exec(
		"DROP INDEX " + userSubscriptionActiveUniqueIndexName,
	).Error)
}

package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
)

// userSubscriptionActiveUniqueIndexName is the name of the database-level
// constraint that enforces "one active subscription per user". Exported via
// the helper so tests and migration tooling can reference the same constant.
const userSubscriptionActiveUniqueIndexName = "idx_user_sub_one_active"

// mysqlUserSubscriptionActiveGenCol is the stored generated column used on
// MySQL (which has no partial indexes) to emulate the partial unique index.
// The column resolves to 1 when status='active' and NULL otherwise, so a
// UNIQUE(user_id, active_user_id) index only constrains active rows.
const mysqlUserSubscriptionActiveGenCol = "active_user_id"

// migrateUserSubscriptionUniqueActiveIndex enforces the one-subscription-per-
// user rule at the database layer. The application already guards every
// purchase path (controller fast-fail + transactional check inside
// PurchaseSubscriptionWithBalance), but that logic can be bypassed by direct
// SQL, partial outages, or future code paths. This migration makes the rule a
// physical invariant so a second active subscription cannot land in the table
// under any code path.
//
// Two steps run in order so the migration is safe on databases that were
// running before the constraint existed:
//
//  1. dedupeUserSubscriptionsActive: for each user with multiple rows whose
//     status='active', keep only the row with the highest id (the most recent)
//     and mark the older rows as 'cancelled'. Cancelled rows are excluded
//     from the partial unique index, so the constraint can install.
//
//  2. ensureUserSubscriptionActiveUniqueIndex: install the constraint in a
//     form each supported database understands. SQLite and PostgreSQL use a
//     partial unique index (`WHERE status='active'`); MySQL has no partial
//     index syntax, so we use a STORED generated column plus a composite
//     UNIQUE(user_id, active_user_id) where active_user_id is NULL for
//     non-active rows and MySQL's NULL-not-equal semantics allow those.
//
// The migration is idempotent: step 1 is a no-op when no duplicates remain,
// and step 2 short-circuits when the index (or column, on MySQL) already
// exists. Re-running on an up-to-date database is therefore cheap and safe.
func migrateUserSubscriptionUniqueActiveIndex() error {
	if err := dedupeUserSubscriptionsActive(); err != nil {
		return fmt.Errorf("dedupe active subscriptions: %w", err)
	}
	if err := ensureUserSubscriptionActiveUniqueIndex(); err != nil {
		return fmt.Errorf("ensure one-active-subscription unique index: %w", err)
	}
	return nil
}

// dedupeUserSubscriptionsActive collapses multiple active subscriptions per
// user down to one (the most recent, identified by max id) by marking the
// older ones as 'cancelled'. History is preserved: the cancelled rows remain
// in the table and continue to power billing queries, but they no longer
// count toward the one-active-subscription invariant.
func dedupeUserSubscriptionsActive() error {
	if !DB.Migrator().HasTable(&UserSubscription{}) {
		return nil
	}
	switch {
	case common.UsingMainDatabase(common.DatabaseTypeMySQL):
		// MySQL rejects UPDATE statements whose subquery references the
		// same table, so we use a derived-table JOIN instead. The inner
		// HAVING COUNT(*) > 1 keeps the cost down when there are no
		// duplicates.
		return DB.Exec(`UPDATE user_subscriptions u
JOIN (
    SELECT user_id, MAX(id) AS keep_id
    FROM user_subscriptions
    WHERE status = 'active'
    GROUP BY user_id
    HAVING COUNT(*) > 1
) m ON u.user_id = m.user_id AND u.id < m.keep_id
SET u.status = 'cancelled'
WHERE u.status = 'active'`).Error
	default:
		// SQLite and PostgreSQL accept the same NOT IN subquery form.
		return DB.Exec(`UPDATE user_subscriptions
SET status = 'cancelled'
WHERE status = 'active'
  AND id NOT IN (
    SELECT MAX(id) FROM user_subscriptions
    WHERE status = 'active'
    GROUP BY user_id
  )`).Error
	}
}

// ensureUserSubscriptionActiveUniqueIndex installs the database constraint.
// It is a thin dispatcher around the dialect-specific helpers below.
func ensureUserSubscriptionActiveUniqueIndex() error {
	if !DB.Migrator().HasTable(&UserSubscription{}) {
		return nil
	}
	if common.UsingMainDatabase(common.DatabaseTypeMySQL) {
		return ensureMySQLActiveSubscriptionUniqueIndex()
	}
	return ensurePartialActiveSubscriptionUniqueIndex()
}

// ensurePartialActiveSubscriptionUniqueIndex creates the partial unique
// index on (user_id) WHERE status='active'. Used by SQLite and PostgreSQL.
// Both engines support CREATE UNIQUE INDEX IF NOT EXISTS, so re-running
// the migration is safe.
func ensurePartialActiveSubscriptionUniqueIndex() error {
	var quotedIndex string
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		quotedIndex = `"` + userSubscriptionActiveUniqueIndexName + `"`
	} else {
		quotedIndex = "`" + userSubscriptionActiveUniqueIndexName + "`"
	}
	sql := "CREATE UNIQUE INDEX IF NOT EXISTS " + quotedIndex +
		" ON user_subscriptions(user_id) WHERE status = 'active'"
	return DB.Exec(sql).Error
}

// ensureMySQLActiveSubscriptionUniqueIndex installs a STORED generated
// column plus a composite unique index to emulate a partial unique index.
// The generated column is 1 for active rows and NULL otherwise, so the
// composite UNIQUE(user_id, active_user_id) only fires when both rows
// would be active — non-active rows contribute NULL and are not constrained
// (MySQL treats NULLs as distinct in unique indexes).
func ensureMySQLActiveSubscriptionUniqueIndex() error {
	if err := ensureMySQLActiveUserIdGenColumn(); err != nil {
		return err
	}
	if err := ensureMySQLActiveUserIdIndex(); err != nil {
		return err
	}
	return nil
}

// ensureMySQLActiveUserIdGenColumn adds the stored generated column used
// by the MySQL emulation. Older MySQL versions (<8.0.29) reject
// ADD COLUMN IF NOT EXISTS, so we look the column up in information_schema
// first and only emit the ALTER when it is missing.
func ensureMySQLActiveUserIdGenColumn() error {
	var columnCount int64
	if err := DB.Raw(`SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'user_subscriptions'
  AND column_name = ?`, mysqlUserSubscriptionActiveGenCol).Scan(&columnCount).Error; err != nil {
		return err
	}
	if columnCount > 0 {
		return nil
	}
	return DB.Exec(`ALTER TABLE user_subscriptions
ADD COLUMN ` + mysqlUserSubscriptionActiveGenCol + ` TINYINT
    GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN 1 ELSE NULL END) STORED`).Error
}

// ensureMySQLActiveUserIdIndex creates the composite unique index on
// (user_id, active_user_id). MySQL has no IF NOT EXISTS clause for CREATE
// INDEX in the versions we target (>=5.7.8), so we check information_schema
// first. The check is sufficient because CREATE INDEX on an existing name
// would otherwise fail with a duplicate-name error.
func ensureMySQLActiveUserIdIndex() error {
	var indexCount int64
	if err := DB.Raw(`SELECT COUNT(*) FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'user_subscriptions'
  AND index_name = ?`, userSubscriptionActiveUniqueIndexName).Scan(&indexCount).Error; err != nil {
		return err
	}
	if indexCount > 0 {
		return nil
	}
	return DB.Exec(fmt.Sprintf(
		"CREATE UNIQUE INDEX `%s` ON user_subscriptions(user_id, `%s`)",
		userSubscriptionActiveUniqueIndexName,
		mysqlUserSubscriptionActiveGenCol,
	)).Error
}

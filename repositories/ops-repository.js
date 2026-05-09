async function loadDatabaseOverview(pool) {
  const result = await pool.query(`
    SELECT
      NOW() AS checked_at,
      current_database() AS database_name,
      current_user AS database_user,
      version() AS database_version
  `);

  return result.rows[0] || {};
}

module.exports = {
  loadDatabaseOverview,
};

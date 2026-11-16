-- Every column that points at a user, from schema metadata only (no rows read).
-- Compare with ACCOUNT_LINKS in server/accountData.ts: anything listed here and
-- missing there is data that account deletion and export don't know about.
--
-- Part 1: foreign keys to auth.users, with what ON DELETE does.
SELECT n.nspname || '.' || cl.relname || '.' || a.attname AS col,
       CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                          WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
 WHERE c.contype = 'f'
   AND c.confrelid = 'auth.users'::regclass
   AND n.nspname NOT IN ('auth', 'storage')
 ORDER BY 1;

-- Part 2: columns that look like a user id or an email but have no foreign key.
WITH fk AS (
  SELECT c.conrelid, a.attname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
   WHERE c.contype = 'f'
)
SELECT n.nspname || '.' || cl.relname || '.' || a.attname AS col,
       format_type(a.atttypid, a.atttypmod) AS type
  FROM pg_attribute a
  JOIN pg_class cl ON cl.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
 WHERE cl.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
   AND n.nspname NOT IN ('auth', 'storage', 'pg_catalog', 'information_schema', 'realtime', 'supabase_functions',
                         'extensions', 'vault', 'graphql', 'graphql_public', 'net', 'cron', 'pgsodium',
                         'supabase_migrations', '_realtime', 'pgbouncer', 'archive')
   AND a.attname ~* '(user_id|_by$|owner|email|author|member_id|customer|date_of_birth|dob|phone)'
   AND NOT EXISTS (SELECT 1 FROM fk WHERE fk.conrelid = cl.oid AND fk.attname = a.attname)
 ORDER BY 1;

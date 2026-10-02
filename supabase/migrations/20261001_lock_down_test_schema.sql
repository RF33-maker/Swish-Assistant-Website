-- Lock down the `test` schema (kept for future test imports)
--
-- `test` holds copies of the game tables (12 tables, 3 views) used for test
-- imports. Signed-out and signed-in users had USAGE on the schema and full
-- read/write/delete/truncate on every table, with RLS off. Default privileges
-- also handed the same rights to anon/authenticated on any new table or
-- sequence created in `test`.
--
-- After this:
--   • anon/authenticated can't reach anything in `test` (no schema USAGE,
--     no table grants, no default grants for future objects)
--   • RLS is on for every table, as a second layer
--   • service_role and SQL (postgres) keep full access, so test imports via
--     the service key keep working
--
-- To expose a test table to the browser later: GRANT USAGE on the schema and
-- SELECT on the table to the role, and add an RLS policy.

REVOKE ALL ON SCHEMA test FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES    IN SCHEMA test FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA test FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA test FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA test REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA test REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA test REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

GRANT USAGE ON SCHEMA test TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA test TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA test TO service_role;

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'test' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE test.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

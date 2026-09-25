CREATE SCHEMA IF NOT EXISTS "private";

REVOKE ALL ON SCHEMA "private" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA "private" FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA "private" FROM authenticated;
  END IF;
END $$;

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT namespace.nspname AS schema_name, class.relname AS table_name
    FROM pg_class AS class
    INNER JOIN pg_namespace AS namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p')
      AND class.relrowsecurity = false
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      table_record.schema_name,
      table_record.table_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "private"."enable_rls_for_new_public_tables"()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  command_record record;
BEGIN
  FOR command_record IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF command_record.schema_name = 'public' THEN
      BEGIN
        EXECUTE format(
          'ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY',
          command_record.object_identity
        );
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'enable_rls_for_new_public_tables failed for %',
            command_record.object_identity;
      END;
    END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS "ensure_public_tables_have_rls";

CREATE EVENT TRIGGER "ensure_public_tables_have_rls"
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
EXECUTE FUNCTION "private"."enable_rls_for_new_public_tables"();

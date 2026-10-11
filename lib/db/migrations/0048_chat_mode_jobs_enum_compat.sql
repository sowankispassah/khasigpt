DO $$
DECLARE
  enum_schema_name text;
  enum_type_name text;
BEGIN
  SELECT type_ns.nspname, t.typname
  INTO enum_schema_name, enum_type_name
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace table_ns ON table_ns.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  JOIN pg_namespace type_ns ON type_ns.oid = t.typnamespace
  WHERE c.relname = 'Chat'
    AND table_ns.nspname = 'public'
    AND a.attname = 'mode'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND t.typtype = 'e'
  LIMIT 1;

  IF enum_type_name IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = enum_schema_name
        AND t.typname = enum_type_name
        AND e.enumlabel = 'jobs'
    ) THEN
      EXECUTE format(
        'ALTER TYPE %I.%I ADD VALUE %L',
        enum_schema_name,
        enum_type_name,
        'jobs'
      );
    END IF;
  END IF;
END $$;

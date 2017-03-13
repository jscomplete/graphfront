exports.columnsView = `
  SELECT cols.table_schema,
    cols.table_name,
    cols.column_name,
    cols.is_nullable,
    cols.data_type,
    cols.column_default,
    fkv.constraint_type,
    cols.ordinal_position,
    fkv.related_table_name,
    fkv.related_column_name
  FROM information_schema.columns cols
    LEFT OUTER JOIN (
      SELECT tc.table_schema,
        tc.table_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS related_table_name,
        ccu.column_name AS related_column_name
      FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND kcu.table_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    ) fkv
      ON fkv.table_schema = cols.table_schema
      AND fkv.table_name = cols.table_name
      AND fkv.column_name = cols.column_name
`;

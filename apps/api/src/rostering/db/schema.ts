const SCHEMA_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function schemaRef(schema: string): string {
  if (!SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error(`Invalid database schema name: ${schema}`);
  }
  return `"${schema}"`;
}

export function tableRef(schema: string, table: string): string {
  if (!IDENTIFIER_PATTERN.test(table)) {
    throw new Error(`Invalid database table name: ${table}`);
  }
  return `${schemaRef(schema)}."${table}"`;
}

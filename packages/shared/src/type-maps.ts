/**
 * PostgreSQL OID to Type Name Mapping
 * Single source of truth for type resolution across main and renderer processes
 * Reference: https://github.com/postgres/postgres/blob/master/src/include/catalog/pg_type.dat
 */
export const PG_TYPE_MAP: Record<number, string> = {
  // Boolean
  16: "boolean",

  // Binary
  17: "bytea",

  // Character types
  18: "char",
  19: "name",
  25: "text",
  1042: "char",
  1043: "varchar",

  // Numeric types
  20: "bigint",
  21: "smallint",
  23: "integer",
  24: "regproc",
  26: "oid",
  700: "real",
  701: "double precision",
  790: "money",
  1700: "numeric",

  // JSON/XML types
  114: "json",
  142: "xml",
  3802: "jsonb",

  // Geometric types
  600: "point",
  601: "lseg",
  602: "path",
  603: "box",
  604: "polygon",
  628: "line",
  718: "circle",

  // Network types
  650: "cidr",
  829: "macaddr",
  869: "inet",

  // Date/Time types
  1082: "date",
  1083: "time",
  1114: "timestamp",
  1184: "timestamptz",
  1186: "interval",
  1266: "timetz",

  // Bit string types
  1560: "bit",
  1562: "varbit",

  // UUID
  2950: "uuid",

  // Range types
  3904: "int4range",
  3906: "numrange",
  3908: "tsrange",
  3910: "tstzrange",
  3912: "daterange",
  3926: "int8range",

  // Array types (common ones)
  199: "json[]",
  1000: "boolean[]",
  1001: "bytea[]",
  1005: "smallint[]",
  1007: "integer[]",
  1009: "text[]",
  1014: "char[]",
  1015: "varchar[]",
  1016: "bigint[]",
  1021: "real[]",
  1022: "double precision[]",
  1028: "oid[]",
  1115: "timestamp[]",
  1182: "date[]",
  1183: "time[]",
  1231: "numeric[]",
  2951: "uuid[]",
  3807: "jsonb[]",
};

/**
 * Resolve PostgreSQL OID to human-readable type name
 * @param dataTypeID - PostgreSQL OID for the data type
 * @returns Human-readable type name or 'unknown(OID)' if not found
 */
export function resolvePostgresType(dataTypeID: number): string {
  return PG_TYPE_MAP[dataTypeID] ?? `unknown(${dataTypeID})`;
}

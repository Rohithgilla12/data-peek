export type SQLDialect = "postgresql" | "mysql" | "mssql" | "standard";

const SQL_KEYWORDS = new Set([
  "select",
  "from",
  "where",
  "insert",
  "update",
  "delete",
  "create",
  "drop",
  "alter",
  "table",
  "index",
  "view",
  "order",
  "by",
  "group",
  "having",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "cross",
  "full",
  "on",
  "and",
  "or",
  "not",
  "null",
  "true",
  "false",
  "as",
  "in",
  "is",
  "like",
  "between",
  "case",
  "when",
  "then",
  "else",
  "end",
  "user",
  "role",
  "grant",
  "revoke",
  "limit",
  "offset",
  "values",
  "set",
  "primary",
  "key",
  "foreign",
  "references",
  "unique",
  "check",
  "default",
  "constraint",
  "asc",
  "desc",
  "distinct",
  "all",
  "any",
  "exists",
  "union",
  "intersect",
  "except",
  "into",
  "with",
  "recursive",
  "using",
  "natural",
  "partition",
  "over",
  "window",
  "row",
  "rows",
  "range",
  "current",
  "first",
  "last",
  "next",
  "prior",
  "fetch",
  "percent",
  "only",
  "ties",
]);

export function isSQLKeyword(word: string): boolean {
  return SQL_KEYWORDS.has(word.toLowerCase());
}

export function escapeSQLIdentifier(
  name: string,
  dialect: SQLDialect = "standard",
): string {
  const needsQuoting = !/^[a-z_][a-z0-9_]*$/i.test(name) || isSQLKeyword(name);

  if (!needsQuoting) {
    return name;
  }

  switch (dialect) {
    case "mysql":
      return `\`${name.replace(/`/g, "``")}\``;
    case "mssql":
      return `[${name.replace(/\]/g, "]]")}]`;
    default:
      return `"${name.replace(/"/g, '""')}"`;
  }
}

export function escapeSQLValue(
  value: unknown,
  dataType: string,
  dialect: SQLDialect = "standard",
): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  const lowerType = dataType.toLowerCase();

  // Boolean types
  if (lowerType.includes("bool") || lowerType === "bit") {
    if (dialect === "mysql" || dialect === "mssql") {
      return value ? "1" : "0";
    }
    return value ? "TRUE" : "FALSE";
  }

  // Handle special numeric values
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return dialect === "postgresql" ? "'NaN'::float" : "NULL";
    }
    if (!Number.isFinite(value)) {
      if (dialect === "postgresql") {
        return value > 0 ? "'Infinity'::float" : "'-Infinity'::float";
      }
      return "NULL";
    }
  }

  // Handle BigInt
  if (typeof value === "bigint") {
    return value.toString();
  }

  // Numeric types - don't quote
  if (
    lowerType.includes("int") ||
    lowerType.includes("numeric") ||
    lowerType.includes("decimal") ||
    lowerType.includes("float") ||
    lowerType.includes("double") ||
    lowerType.includes("real") ||
    lowerType.includes("money") ||
    lowerType.includes("serial") ||
    lowerType === "number"
  ) {
    const numVal = Number(value);
    if (!Number.isNaN(numVal)) {
      return String(value);
    }
  }

  // UUID types
  if (lowerType.includes("uuid") || lowerType.includes("uniqueidentifier")) {
    const strValue = String(value);
    return `'${strValue.replace(/'/g, "''")}'`;
  }

  // Date/Time types
  if (
    lowerType.includes("date") ||
    lowerType.includes("time") ||
    lowerType.includes("timestamp")
  ) {
    if (value instanceof Date) {
      const isoString = value.toISOString();
      if (lowerType === "date") {
        return `'${isoString.split("T")[0]}'`;
      }
      if (lowerType === "time" || lowerType === "time without time zone") {
        return `'${isoString.split("T")[1].replace("Z", "")}'`;
      }
      return `'${isoString}'`;
    }
    const strValue = String(value);
    return `'${strValue.replace(/'/g, "''")}'`;
  }

  // Binary/Bytea types
  if (
    lowerType.includes("bytea") ||
    lowerType.includes("binary") ||
    lowerType.includes("blob") ||
    lowerType.includes("varbinary")
  ) {
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
      const bytes =
        value instanceof ArrayBuffer ? new Uint8Array(value) : value;
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (dialect === "postgresql") {
        return `'\\x${hex}'`;
      }
      if (dialect === "mysql") {
        return `X'${hex}'`;
      }
      if (dialect === "mssql") {
        return `0x${hex}`;
      }
      return `'${hex}'`;
    }
    const strValue = String(value);
    return `'${strValue.replace(/'/g, "''")}'`;
  }

  // JSON/JSONB types
  if (lowerType.includes("json")) {
    const jsonStr = typeof value === "string" ? value : JSON.stringify(value);
    const escaped = jsonStr.replace(/'/g, "''");
    if (dialect === "postgresql" && lowerType === "jsonb") {
      return `'${escaped}'::jsonb`;
    }
    return `'${escaped}'`;
  }

  // Array types (PostgreSQL)
  if (
    lowerType.startsWith("_") ||
    lowerType.includes("[]") ||
    lowerType === "array"
  ) {
    if (Array.isArray(value)) {
      if (dialect === "postgresql") {
        const arrayLiteral = JSON.stringify(value)
          .replace(/^\[/, "{")
          .replace(/\]$/, "}")
          .replace(/'/g, "''");
        return `'${arrayLiteral}'`;
      }
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }
  }

  // Handle arrays that weren't caught by type
  if (Array.isArray(value)) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }

  // Object types
  if (typeof value === "object" && value !== null) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }

  // String and other types
  const stringValue = String(value);
  return `'${stringValue.replace(/'/g, "''")}'`;
}

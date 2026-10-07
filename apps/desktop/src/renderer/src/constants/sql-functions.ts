// SQL Functions for autocomplete
export const SQL_FUNCTIONS = [
  // Aggregate functions
  { name: 'COUNT', signature: 'COUNT(expression)', description: 'Returns the number of rows' },
  { name: 'SUM', signature: 'SUM(expression)', description: 'Returns the sum of values' },
  { name: 'AVG', signature: 'AVG(expression)', description: 'Returns the average value' },
  { name: 'MIN', signature: 'MIN(expression)', description: 'Returns the minimum value' },
  { name: 'MAX', signature: 'MAX(expression)', description: 'Returns the maximum value' },
  {
    name: 'GROUP_CONCAT',
    signature: 'GROUP_CONCAT(expression)',
    description: 'Concatenates values from a group'
  },
  // String functions
  { name: 'CONCAT', signature: 'CONCAT(str1, str2, ...)', description: 'Concatenates strings' },
  {
    name: 'SUBSTRING',
    signature: 'SUBSTRING(str, start, length)',
    description: 'Extracts a substring'
  },
  { name: 'UPPER', signature: 'UPPER(str)', description: 'Converts to uppercase' },
  { name: 'LOWER', signature: 'LOWER(str)', description: 'Converts to lowercase' },
  { name: 'TRIM', signature: 'TRIM(str)', description: 'Removes leading/trailing whitespace' },
  { name: 'LENGTH', signature: 'LENGTH(str)', description: 'Returns string length' },
  { name: 'REPLACE', signature: 'REPLACE(str, from, to)', description: 'Replaces occurrences' },
  {
    name: 'COALESCE',
    signature: 'COALESCE(val1, val2, ...)',
    description: 'Returns first non-null value'
  },
  {
    name: 'NULLIF',
    signature: 'NULLIF(val1, val2)',
    description: 'Returns null if values are equal'
  },
  { name: 'IFNULL', signature: 'IFNULL(val, default)', description: 'Returns default if null' },
  // Date functions
  { name: 'NOW', signature: 'NOW()', description: 'Returns current timestamp' },
  { name: 'DATE', signature: 'DATE(expression)', description: 'Extracts date part' },
  { name: 'TIME', signature: 'TIME(expression)', description: 'Extracts time part' },
  { name: 'DATETIME', signature: 'DATETIME(expression)', description: 'Creates datetime value' },
  { name: 'STRFTIME', signature: 'STRFTIME(format, datetime)', description: 'Formats datetime' },
  // Math functions
  { name: 'ABS', signature: 'ABS(number)', description: 'Returns absolute value' },
  { name: 'ROUND', signature: 'ROUND(number, decimals)', description: 'Rounds a number' },
  { name: 'CEIL', signature: 'CEIL(number)', description: 'Rounds up to nearest integer' },
  { name: 'FLOOR', signature: 'FLOOR(number)', description: 'Rounds down to nearest integer' },
  { name: 'RANDOM', signature: 'RANDOM()', description: 'Returns random number' },
  // Type functions
  { name: 'TYPEOF', signature: 'TYPEOF(expression)', description: 'Returns the type of value' },
  {
    name: 'CAST',
    signature: 'CAST(expression AS type)',
    description: 'Converts to specified type'
  },
  // SQLite specific
  { name: 'PRINTF', signature: 'PRINTF(format, ...)', description: 'Formatted string output' },
  { name: 'INSTR', signature: 'INSTR(str, substr)', description: 'Returns position of substring' },
  { name: 'GLOB', signature: 'GLOB(pattern, str)', description: 'Pattern matching with glob' },
  { name: 'HEX', signature: 'HEX(value)', description: 'Returns hex representation' },
  { name: 'QUOTE', signature: 'QUOTE(value)', description: 'Returns SQL literal' },
  { name: 'ZEROBLOB', signature: 'ZEROBLOB(n)', description: 'Returns n-byte blob of zeros' },
  { name: 'JSON', signature: 'JSON(value)', description: 'Validates and minifies JSON' },
  {
    name: 'JSON_EXTRACT',
    signature: 'JSON_EXTRACT(json, path)',
    description: 'Extracts value from JSON'
  },
  { name: 'JSON_ARRAY', signature: 'JSON_ARRAY(...)', description: 'Creates JSON array' },
  { name: 'JSON_OBJECT', signature: 'JSON_OBJECT(...)', description: 'Creates JSON object' },
  // ClickHouse specific
  {
    name: 'uniq',
    signature: 'uniq(x[, ...])',
    description: 'Returns approximate number of distinct values'
  },
  {
    name: 'uniqExact',
    signature: 'uniqExact(x[, ...])',
    description: 'Returns exact number of distinct values'
  },
  {
    name: 'quantile',
    signature: 'quantile(level)(expr)',
    description: 'Returns approximate quantile of values'
  },
  {
    name: 'groupArray',
    signature: 'groupArray(x)',
    description: 'Collects values from a group into an array'
  },
  {
    name: 'topK',
    signature: 'topK(N)(column)',
    description: 'Returns approximately most frequent values'
  },
  { name: 'argMax', signature: 'argMax(arg, val)', description: 'Returns arg for the maximum val' },
  { name: 'argMin', signature: 'argMin(arg, val)', description: 'Returns arg for the minimum val' },
  { name: 'countIf', signature: 'countIf(cond)', description: 'Counts rows matching a condition' },
  {
    name: 'sumIf',
    signature: 'sumIf(column, cond)',
    description: 'Sums values in rows matching a condition'
  },
  { name: 'toDate', signature: 'toDate(x)', description: 'Converts to Date' },
  {
    name: 'toDateTime',
    signature: 'toDateTime(expr[, time_zone])',
    description: 'Converts to DateTime'
  },
  {
    name: 'toDateTime64',
    signature: 'toDateTime64(expr, scale[, timezone])',
    description: 'Converts to DateTime64'
  },
  {
    name: 'toStartOfDay',
    signature: 'toStartOfDay(datetime)',
    description: 'Rounds down to the start of the day'
  },
  {
    name: 'toStartOfHour',
    signature: 'toStartOfHour(datetime)',
    description: 'Rounds down to the start of the hour'
  },
  {
    name: 'toStartOfWeek',
    signature: 'toStartOfWeek(datetime[, mode[, timezone]])',
    description: 'Rounds down to the start of the week'
  },
  {
    name: 'toStartOfMonth',
    signature: 'toStartOfMonth(value)',
    description: 'Rounds down to the first day of the month'
  },
  {
    name: 'toStartOfInterval',
    signature: 'toStartOfInterval(value, INTERVAL x unit[, time_zone])',
    description: 'Rounds down to the start of an interval'
  },
  {
    name: 'toYYYYMM',
    signature: 'toYYYYMM(datetime[, timezone])',
    description: 'Returns year and month as YYYYMM'
  },
  { name: 'today', signature: 'today()', description: 'Returns current date' },
  {
    name: 'dateDiff',
    signature: 'dateDiff(unit, startdate, enddate[, timezone])',
    description: 'Counts unit boundaries crossed between dates'
  },
  {
    name: 'formatDateTime',
    signature: 'formatDateTime(datetime, format[, timezone])',
    description: 'Formats datetime'
  },
  {
    name: 'arrayJoin',
    signature: 'arrayJoin(arr)',
    description: 'Expands an array into one row per element'
  },
  {
    name: 'arrayMap',
    signature: 'arrayMap(func, arr)',
    description: 'Applies a lambda to each array element'
  },
  {
    name: 'arrayFilter',
    signature: 'arrayFilter(func, arr)',
    description: 'Keeps array elements matching a lambda'
  },
  {
    name: 'has',
    signature: 'has(haystack, needle)',
    description: 'Checks whether an array contains an element'
  },
  {
    name: 'if',
    signature: 'if(cond, then, else)',
    description: 'Returns then or else depending on cond'
  },
  {
    name: 'multiIf',
    signature: 'multiIf(cond_1, then_1, cond_2, then_2, ..., else)',
    description: 'Returns the result of the first true condition'
  },
  { name: 'toString', signature: 'toString(value[, timezone])', description: 'Converts to String' },
  { name: 'toInt64', signature: 'toInt64(expr)', description: 'Converts to Int64' },
  { name: 'toUInt64', signature: 'toUInt64(expr)', description: 'Converts to UInt64' },
  { name: 'toFloat64', signature: 'toFloat64(expr)', description: 'Converts to Float64' },
  {
    name: 'toTypeName',
    signature: 'toTypeName(x)',
    description: 'Returns the type name of a value'
  },
  {
    name: 'parseDateTimeBestEffort',
    signature: 'parseDateTimeBestEffort(time_string[, time_zone])',
    description: 'Parses a date and time string into DateTime'
  }
]

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
  { name: 'JSON_OBJECT', signature: 'JSON_OBJECT(...)', description: 'Creates JSON object' }
]

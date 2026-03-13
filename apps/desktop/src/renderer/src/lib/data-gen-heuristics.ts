import type { ColumnGenerator } from '@shared/index'

interface Heuristic {
  pattern: RegExp
  generator: Partial<ColumnGenerator>
}

const HEURISTICS: Heuristic[] = [
  { pattern: /^email$/i, generator: { generatorType: 'faker', fakerMethod: 'internet.email' } },
  {
    pattern: /^(first_?name|fname)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'person.firstName' }
  },
  {
    pattern: /^(last_?name|lname|surname)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'person.lastName' }
  },
  {
    pattern: /^(name|full_?name)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'person.fullName' }
  },
  {
    pattern: /^(phone|mobile|cell)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'phone.number' }
  },
  { pattern: /^(city)$/i, generator: { generatorType: 'faker', fakerMethod: 'location.city' } },
  {
    pattern: /^(country)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'location.country' }
  },
  {
    pattern: /^(url|website)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'internet.url' }
  },
  {
    pattern: /^(bio|description|about)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'lorem.paragraph' }
  },
  {
    pattern: /^(title|subject)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'lorem.sentence' }
  },
  {
    pattern: /^(company|organization)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'company.name' }
  },
  {
    pattern: /^(created|updated|deleted)_?(at|on|date)?$/i,
    generator: { generatorType: 'faker', fakerMethod: 'date.recent' }
  },
  { pattern: /^(uuid|guid)$/i, generator: { generatorType: 'uuid' } }
]

export function getHeuristicGenerator(
  columnName: string,
  dataType: string
): Partial<ColumnGenerator> {
  for (const h of HEURISTICS) {
    if (h.pattern.test(columnName)) {
      return h.generator
    }
  }

  const dt = dataType.toLowerCase()

  if (dt.includes('uuid')) return { generatorType: 'uuid' }
  if (dt === 'boolean' || dt === 'bool') return { generatorType: 'random-boolean' }
  if (
    dt.includes('int') ||
    dt === 'smallint' ||
    dt === 'bigint' ||
    dt === 'tinyint' ||
    dt === 'serial' ||
    dt === 'bigserial'
  ) {
    return { generatorType: 'random-int', minValue: 1, maxValue: 1000 }
  }
  if (
    dt.includes('float') ||
    dt.includes('double') ||
    dt.includes('decimal') ||
    dt.includes('numeric') ||
    dt.includes('real') ||
    dt.includes('money')
  ) {
    return { generatorType: 'random-float', minValue: 0, maxValue: 1000 }
  }
  if (
    dt.includes('timestamp') ||
    dt.includes('datetime') ||
    dt.includes('date') ||
    dt.includes('time')
  ) {
    return { generatorType: 'random-date' }
  }

  return { generatorType: 'faker', fakerMethod: 'lorem.word' }
}

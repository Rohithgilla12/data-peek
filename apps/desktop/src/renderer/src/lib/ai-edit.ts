import type { AIMessage } from '@shared/index'

/**
 * The single chat turn behind "Edit with AI": the instruction, the SQL being
 * edited, and, when only a selection is edited, the whole query around it so
 * the model can see aliases and joins it must stay consistent with.
 */
export function editRequest(instruction: string, target: string, whole?: string): AIMessage[] {
  const parts = [
    `Rewrite this SQL: ${instruction.trim()}`,
    'Reply with type "query", and put the complete replacement in the sql field. Keep everything the instruction does not ask you to change.',
    `\`\`\`sql\n${target}\n\`\`\``
  ]
  if (whole && whole !== target) {
    parts.push(
      `It is a selected part of this larger query. Return only the replacement for the selected part.\n\`\`\`sql\n${whole}\n\`\`\``
    )
  }
  return [{ role: 'user', content: parts.join('\n\n') }]
}

import { describe, expect, it } from 'vitest'
import { editRequest } from '../ai-edit'

describe('editRequest', () => {
  it('sends the instruction and the SQL as one user turn', () => {
    const [msg, ...rest] = editRequest('  only active users ', 'select * from users')
    expect(rest).toHaveLength(0)
    expect(msg.role).toBe('user')
    expect(msg.content).toContain('Rewrite this SQL: only active users')
    expect(msg.content).toContain('select * from users')
    expect(msg.content).not.toContain('selected part')
  })

  it('includes the surrounding query when editing a selection', () => {
    const [msg] = editRequest('add an alias', 'u.email', 'select u.email from users u')
    expect(msg.content).toContain('selected part')
    expect(msg.content).toContain('select u.email from users u')
  })
})

// gui/src/renderer/lib/agent-utils.test.ts
import { describe, test, expect } from 'vitest'
import {
  getInitials,
  hashName,
  getGradient,
  getAgentStatus,
  getSuccessRate,
  formatRelativeTime
} from './agent-utils'

describe('getInitials', () => {
  test('two-word name returns two initials', () => {
    expect(getInitials('Code Reviewer')).toBe('CR')
  })
  test('single-word name returns first letter', () => {
    expect(getInitials('Deployer')).toBe('D')
  })
  test('three-word name returns first two initials', () => {
    expect(getInitials('My Deploy Bot')).toBe('MD')
  })
  test('empty string returns empty', () => {
    expect(getInitials('')).toBe('')
  })
})

describe('hashName', () => {
  test('returns consistent number for same input', () => {
    expect(hashName('test')).toBe(hashName('test'))
  })
  test('returns different number for different input', () => {
    expect(hashName('foo')).not.toBe(hashName('bar'))
  })
})

describe('getGradient', () => {
  test('returns a gradient pair from the palette', () => {
    const g = getGradient('Code Reviewer')
    expect(g).toHaveProperty('from')
    expect(g).toHaveProperty('to')
    expect(g.from).toMatch(/^#[0-9a-f]{6}$/i)
  })
  test('same name always returns same gradient', () => {
    expect(getGradient('Deploy Bot')).toEqual(getGradient('Deploy Bot'))
  })
})

describe('getAgentStatus', () => {
  test('running run returns running', () => {
    expect(getAgentStatus([{ status: 'running' }] as any)).toBe('running')
  })
  test('success run returns success', () => {
    expect(getAgentStatus([{ status: 'success' }] as any)).toBe('success')
  })
  test('failure run returns failed', () => {
    expect(getAgentStatus([{ status: 'failure' }] as any)).toBe('failed')
  })
  test('canceled run returns idle', () => {
    expect(getAgentStatus([{ status: 'canceled' }] as any)).toBe('idle')
  })
  test('stale run returns stale', () => {
    expect(getAgentStatus([{ status: 'stale' }] as any)).toBe('stale')
  })
  test('empty runs returns idle', () => {
    expect(getAgentStatus([])).toBe('idle')
  })
})

describe('getSuccessRate', () => {
  test('all success returns 100', () => {
    const runs = [{ status: 'success' }, { status: 'success' }] as any
    expect(getSuccessRate(runs)).toBe(100)
  })
  test('mixed returns correct percentage', () => {
    const runs = [
      { status: 'success' },
      { status: 'failure' },
      { status: 'success' }
    ] as any
    expect(getSuccessRate(runs)).toBe(67)
  })
  test('no runs returns 0', () => {
    expect(getSuccessRate([])).toBe(0)
  })
})

describe('formatRelativeTime', () => {
  test('formats seconds ago', () => {
    const now = new Date()
    const thirtySecsAgo = new Date(now.getTime() - 30000).toISOString()
    expect(formatRelativeTime(thirtySecsAgo)).toBe('just now')
  })
  test('formats minutes ago', () => {
    const now = new Date()
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60000).toISOString()
    expect(formatRelativeTime(fiveMinsAgo)).toBe('5m ago')
  })
  test('formats hours ago', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600000).toISOString()
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago')
  })
  test('returns empty for undefined', () => {
    expect(formatRelativeTime(undefined)).toBe('')
  })
})

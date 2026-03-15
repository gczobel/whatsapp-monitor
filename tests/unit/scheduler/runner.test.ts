import { describe, it, expect } from 'vitest';
import { buildLLMInput } from '../../../src/scheduler/runner.js';

describe('buildLLMInput', () => {
  it('should include previous summary when one exists', () => {
    const result = buildLLMInput({
      previousSummary: 'Building quiet yesterday.',
      newMessages: [{ sender: 'Yossi', content: 'Noise at 8am', timestamp: new Date() }],
    });
    expect(result).toContain('Building quiet yesterday.');
    expect(result).toContain('Noise at 8am');
  });

  it('should handle empty previous summary', () => {
    const result = buildLLMInput({
      previousSummary: null,
      newMessages: [{ sender: 'Yossi', content: 'Noise at 8am', timestamp: new Date() }],
    });
    expect(result).not.toContain('null');
    expect(result).toContain('Noise at 8am');
  });

  it('should return prompt-only string when no new messages', () => {
    const result = buildLLMInput({
      previousSummary: 'All quiet.',
      newMessages: [],
    });
    expect(result).toContain('All quiet.');
    expect(result).toContain('no new messages');
  });

  it('should include all messages in order', () => {
    const t1 = new Date('2026-01-01T08:00:00Z');
    const t2 = new Date('2026-01-01T09:00:00Z');
    const result = buildLLMInput({
      previousSummary: null,
      newMessages: [
        { sender: 'Alice', content: 'First message', timestamp: t1 },
        { sender: 'Bob', content: 'Second message', timestamp: t2 },
      ],
    });
    expect(result).toContain('Alice');
    expect(result).toContain('First message');
    expect(result).toContain('Bob');
    expect(result).toContain('Second message');
    expect(result.indexOf('First message')).toBeLessThan(result.indexOf('Second message'));
  });

  it('should include sender and timestamp for each message', () => {
    const timestamp = new Date('2026-03-15T10:30:00Z');
    const result = buildLLMInput({
      previousSummary: null,
      newMessages: [{ sender: 'Yossi', content: 'Water leak on floor 3', timestamp }],
    });
    expect(result).toContain('Yossi');
    expect(result).toContain('2026-03-15T10:30:00.000Z');
    expect(result).toContain('Water leak on floor 3');
  });

  it('should not include "Previous summary" section when previousSummary is null', () => {
    const result = buildLLMInput({
      previousSummary: null,
      newMessages: [{ sender: 'A', content: 'Hello', timestamp: new Date() }],
    });
    expect(result).not.toContain('Previous summary');
  });
});

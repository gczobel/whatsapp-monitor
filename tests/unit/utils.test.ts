import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  formatTimestamp,
  logPrefix,
  getNextCronRun,
  getPrevCronRun,
} from '../../src/utils.js';

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should escape less-than signs', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('should escape greater-than signs', () => {
    expect(escapeHtml('1 > 0')).toBe('1 &gt; 0');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's fine")).toBe('it&#39;s fine');
  });

  it('should return the same string when no special characters present', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('should escape all special characters in a mixed string', () => {
    expect(escapeHtml('<a href="test">it\'s a & b</a>')).toBe(
      '&lt;a href=&quot;test&quot;&gt;it&#39;s a &amp; b&lt;/a&gt;',
    );
  });

  it('should return empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('formatTimestamp', () => {
  it('should return a non-empty string for a valid date', () => {
    const result = formatTimestamp(new Date('2026-03-16T12:00:00Z'));
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('should include year, month, and day components', () => {
    const result = formatTimestamp(new Date('2026-03-16T12:00:00Z'));
    expect(result).toContain('2026');
  });
});

describe('logPrefix', () => {
  it('should include the module name', () => {
    expect(logPrefix('scheduler', 'INFO')).toContain('scheduler');
  });

  it('should include the log level', () => {
    expect(logPrefix('db', 'ERROR')).toContain('ERROR');
  });

  it('should include an ISO timestamp', () => {
    const prefix = logPrefix('web', 'WARN');
    // ISO timestamps contain a 'T' separator and 'Z' suffix
    expect(prefix).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should format as [timestamp] [module] [LEVEL]', () => {
    const prefix = logPrefix('config', 'INFO');
    expect(prefix).toMatch(/^\[.*\] \[config\] \[INFO\]$/);
  });
});

describe('getNextCronRun', () => {
  it('should return a Date in the future for a valid cron expression', () => {
    const next = getNextCronRun('0 9 * * *');
    expect(next).toBeInstanceOf(Date);
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  it('should return null for an invalid cron expression', () => {
    expect(getNextCronRun('not a cron')).toBeNull();
  });
});

describe('getPrevCronRun', () => {
  it('should return a Date in the past for a valid cron expression', () => {
    const prev = getPrevCronRun('0 9 * * *');
    expect(prev).toBeInstanceOf(Date);
    expect(prev!.getTime()).toBeLessThan(Date.now());
  });

  it('should return null for an invalid cron expression', () => {
    expect(getPrevCronRun('not a cron')).toBeNull();
  });
});

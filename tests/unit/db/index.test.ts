import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../../src/db/index.js';

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir !== null) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function makeTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'whatsapp-test-'));
  return tempDir;
}

describe('openDatabase', () => {
  it('should create and return a usable database', () => {
    const db = openDatabase(makeTempDir());
    expect(db).toBeTruthy();
    db.close();
  });

  it('should have WAL journal mode enabled', () => {
    const db = openDatabase(makeTempDir());
    const row = db.pragma('journal_mode', { simple: true });
    expect(row).toBe('wal');
    db.close();
  });

  it('should have foreign keys enabled', () => {
    const db = openDatabase(makeTempDir());
    const row = db.pragma('foreign_keys', { simple: true });
    expect(row).toBe(1);
    db.close();
  });

  it('should have run migrations (accounts table exists)', () => {
    const db = openDatabase(makeTempDir());
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'")
      .get();
    expect(row).toBeTruthy();
    db.close();
  });

  it('should create the database file inside the given path', async () => {
    const dir = makeTempDir();
    const db = openDatabase(dir);
    db.close();
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(dir, 'monitor.db'))).toBe(true);
  });
});

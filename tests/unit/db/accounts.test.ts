import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import {
  getAccount,
  upsertAccount,
  setMonitoredGroup,
  clearMonitoredGroup,
} from '../../../src/db/accounts.js';
import { createTestDatabase, seedAccount } from '../../fixtures/index.js';

let db: Database;

beforeEach(() => {
  db = createTestDatabase();
});

describe('getAccount', () => {
  it('should return null when account does not exist', () => {
    expect(getAccount(db, 999)).toBeNull();
  });

  it('should return the account when it exists', () => {
    seedAccount(db, { id: 1, displayName: 'Yossi', phoneNumber: '972501234567' });
    const account = getAccount(db, 1);
    expect(account).not.toBeNull();
    expect(account?.displayName).toBe('Yossi');
    expect(account?.phoneNumber).toBe('972501234567');
  });

  it('should return null monitoredGroupId/Name when not set', () => {
    seedAccount(db);
    const account = getAccount(db, 1);
    expect(account?.monitoredGroupId).toBeNull();
    expect(account?.monitoredGroupName).toBeNull();
  });
});

describe('upsertAccount', () => {
  it('should insert a new account', () => {
    upsertAccount(db, { id: 1, displayName: 'Avi', phoneNumber: '972501111111' });
    const account = getAccount(db, 1);
    expect(account?.displayName).toBe('Avi');
  });

  it('should update displayName and phoneNumber on conflict', () => {
    upsertAccount(db, { id: 1, displayName: 'Old Name', phoneNumber: '000' });
    upsertAccount(db, { id: 1, displayName: 'New Name', phoneNumber: '111' });
    const account = getAccount(db, 1);
    expect(account?.displayName).toBe('New Name');
    expect(account?.phoneNumber).toBe('111');
  });

  it('should preserve monitoredGroup fields on update', () => {
    upsertAccount(db, { id: 1, displayName: 'User', phoneNumber: '000' });
    setMonitoredGroup(db, 1, 'group@g.us', 'My Group');
    upsertAccount(db, { id: 1, displayName: 'Updated', phoneNumber: '111' });
    const account = getAccount(db, 1);
    expect(account?.monitoredGroupId).toBe('group@g.us');
  });
});

describe('setMonitoredGroup', () => {
  it('should set monitored group id and name', () => {
    seedAccount(db);
    setMonitoredGroup(db, 1, '1234567890@g.us', 'Building Group');
    const account = getAccount(db, 1);
    expect(account?.monitoredGroupId).toBe('1234567890@g.us');
    expect(account?.monitoredGroupName).toBe('Building Group');
  });

  it('should overwrite an existing monitored group', () => {
    seedAccount(db);
    setMonitoredGroup(db, 1, 'old@g.us', 'Old Group');
    setMonitoredGroup(db, 1, 'new@g.us', 'New Group');
    const account = getAccount(db, 1);
    expect(account?.monitoredGroupId).toBe('new@g.us');
    expect(account?.monitoredGroupName).toBe('New Group');
  });
});

describe('clearMonitoredGroup', () => {
  it('should set monitoredGroupId and Name to null', () => {
    seedAccount(db);
    setMonitoredGroup(db, 1, 'group@g.us', 'Group');
    clearMonitoredGroup(db, 1);
    const account = getAccount(db, 1);
    expect(account?.monitoredGroupId).toBeNull();
    expect(account?.monitoredGroupName).toBeNull();
  });

  it('should not throw when group was already null', () => {
    seedAccount(db);
    expect(() => clearMonitoredGroup(db, 1)).not.toThrow();
  });
});

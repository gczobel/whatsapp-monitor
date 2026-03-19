import { describe, it, expect, vi } from 'vitest';
import { HistorySyncTracker } from '../../../src/whatsapp/history-sync.js';
import type { BaileysEventMap } from '@whiskeysockets/baileys';

type RawMsg = BaileysEventMap['messages.upsert']['messages'][number];
type HistoryEvent = BaileysEventMap['messaging-history.set'];

function makeGroupMsg(id: string): RawMsg {
  return {
    key: { remoteJid: 'group@g.us', id, fromMe: false },
    message: { conversation: `msg ${id}` },
    messageTimestamp: 1700000000,
    pushName: 'Sender',
  } as unknown as RawMsg;
}

function makeHistoryEvent(
  msgs: RawMsg[],
  isLatest: boolean,
  progress?: number | null,
): HistoryEvent {
  return { messages: msgs, isLatest, progress } as unknown as HistoryEvent;
}

describe('HistorySyncTracker', () => {
  it('should start with isSyncing false and count 0', () => {
    const tracker = new HistorySyncTracker(1, vi.fn(), undefined);
    expect(tracker.isSyncing()).toBe(false);
    expect(tracker.getSyncedMessageCount()).toBe(0);
  });

  it('should set isSyncing to true on first batch', () => {
    const tracker = new HistorySyncTracker(1, vi.fn(), undefined);
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('a')], false));
    expect(tracker.isSyncing()).toBe(true);
  });

  it('should accumulate syncedMessageCount across batches', () => {
    const tracker = new HistorySyncTracker(1, vi.fn(), undefined);
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('a'), makeGroupMsg('b')], false));
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('c')], false));
    expect(tracker.getSyncedMessageCount()).toBe(3);
  });

  it('should call onHandleMessage for each message in a batch', () => {
    const onHandle = vi.fn();
    const tracker = new HistorySyncTracker(1, onHandle, undefined);
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('a'), makeGroupMsg('b')], false));
    expect(onHandle).toHaveBeenCalledTimes(2);
  });

  it('should set isSyncing to false and fire onSyncComplete when isLatest is true', () => {
    const onSyncComplete = vi.fn();
    const tracker = new HistorySyncTracker(1, vi.fn(), onSyncComplete);
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('a')], false));
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('b')], true));
    expect(tracker.isSyncing()).toBe(false);
    expect(onSyncComplete).toHaveBeenCalledOnce();
  });

  it('should NOT fire onSyncComplete when isLatest is true but progress is not 100 (Baileys bug)', () => {
    const onSyncComplete = vi.fn();
    const tracker = new HistorySyncTracker(1, vi.fn(), onSyncComplete);
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('a')], true, 50)); // isLatest=true but only 50% done
    expect(onSyncComplete).not.toHaveBeenCalled();
    expect(tracker.isSyncing()).toBe(true);
  });

  it('should fire onSyncComplete when progress reaches 100 regardless of isLatest', () => {
    const onSyncComplete = vi.fn();
    const tracker = new HistorySyncTracker(1, vi.fn(), onSyncComplete);
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('a')], false, 50));
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('b')], false, 100)); // progress=100 → done
    expect(onSyncComplete).toHaveBeenCalledOnce();
    expect(tracker.isSyncing()).toBe(false);
  });

  it('should not fire onSyncComplete again for batches after isLatest', () => {
    const onSyncComplete = vi.fn();
    const tracker = new HistorySyncTracker(1, vi.fn(), onSyncComplete);
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('a')], true));
    tracker.handleBatch(makeHistoryEvent([makeGroupMsg('b')], true)); // second batch after done
    expect(onSyncComplete).toHaveBeenCalledOnce();
  });

  it('should not count non-group messages in syncedMessageCount', () => {
    const nonGroupMsg = {
      key: { remoteJid: '9725@s.whatsapp.net', id: 'x', fromMe: false },
      message: { conversation: 'dm' },
      messageTimestamp: 1700000000,
    } as unknown as RawMsg;
    const tracker = new HistorySyncTracker(1, vi.fn(), undefined);
    tracker.handleBatch(makeHistoryEvent([nonGroupMsg], false));
    expect(tracker.getSyncedMessageCount()).toBe(0);
  });

  describe('completeFallback()', () => {
    it('should return true and fire onSyncComplete when not yet done', () => {
      const onSyncComplete = vi.fn();
      const tracker = new HistorySyncTracker(1, vi.fn(), onSyncComplete);
      const result = tracker.completeFallback();
      expect(result).toBe(true);
      expect(onSyncComplete).toHaveBeenCalledOnce();
      expect(tracker.isSyncing()).toBe(false);
    });

    it('should return false and not fire again when already done', () => {
      const onSyncComplete = vi.fn();
      const tracker = new HistorySyncTracker(1, vi.fn(), onSyncComplete);
      tracker.handleBatch(makeHistoryEvent([makeGroupMsg('a')], true)); // marks done
      const result = tracker.completeFallback();
      expect(result).toBe(false);
      expect(onSyncComplete).toHaveBeenCalledOnce(); // only from handleBatch, not completeFallback
    });

    it('should log timed-out message when some messages were captured', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const tracker = new HistorySyncTracker(1, vi.fn(), undefined);
      tracker.handleBatch(makeHistoryEvent([makeGroupMsg('a')], false)); // captured = 1, not done
      tracker.completeFallback();
      const messages = consoleSpy.mock.calls.map((c) => String(c[1]));
      expect(messages.some((m) => m.includes('timed out'))).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should log "No history sync" when no messages were captured', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const tracker = new HistorySyncTracker(1, vi.fn(), undefined);
      tracker.completeFallback();
      const messages = consoleSpy.mock.calls.map((c) => String(c[1]));
      expect(messages.some((m) => m.includes('No history sync'))).toBe(true);
      consoleSpy.mockRestore();
    });
  });
});

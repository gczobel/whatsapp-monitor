import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliverResult } from '../../../src/delivery/sender.js';
import type { ScanProfile } from '../../../src/types.js';

function makeProfile(overrides: Partial<ScanProfile> = {}): ScanProfile {
  return {
    id: 'daily',
    name: 'Daily Summary',
    prompt: 'Summarise',
    cron: '0 9 * * *',
    isEnabled: true,
    ...overrides,
  };
}

function makeSession(sendMessageImpl?: () => Promise<void>): {
  sendMessage: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
} {
  return {
    sendMessage: vi
      .fn()
      .mockImplementation(sendMessageImpl ?? ((): Promise<void> => Promise.resolve())),
    getStatus: vi.fn().mockReturnValue('linked'),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('deliverResult', () => {
  it('should call sendMessage with the correct JID', async () => {
    const session = makeSession();
    await deliverResult(session as never, '972501234567', makeProfile(), 'output text');
    expect(session.sendMessage).toHaveBeenCalledOnce();
    const [jid] = session.sendMessage.mock.calls[0] as [string, string];
    expect(jid).toBe('972501234567@s.whatsapp.net');
  });

  it('should include the profile name in the message text', async () => {
    const session = makeSession();
    await deliverResult(
      session as never,
      '972501234567',
      makeProfile({ name: 'Urgent Alerts' }),
      'alert body',
    );
    const [, text] = session.sendMessage.mock.calls[0] as [string, string];
    expect(text).toContain('Urgent Alerts');
  });

  it('should include the output in the message text', async () => {
    const session = makeSession();
    await deliverResult(session as never, '972501234567', makeProfile(), 'my summary output');
    const [, text] = session.sendMessage.mock.calls[0] as [string, string];
    expect(text).toContain('my summary output');
  });

  it('should throw a wrapped error when sendMessage rejects', async () => {
    const session = makeSession(() => Promise.reject(new Error('socket closed')));
    await expect(
      deliverResult(session as never, '972501234567', makeProfile(), 'output'),
    ).rejects.toThrow('Delivery failed');
  });

  it('should include the profile name in the thrown error message', async () => {
    const session = makeSession(() => Promise.reject(new Error('timeout')));
    await expect(
      deliverResult(
        session as never,
        '972501234567',
        makeProfile({ name: 'Weekly Digest' }),
        'out',
      ),
    ).rejects.toThrow('Weekly Digest');
  });
});

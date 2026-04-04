/**
 * Tests for the hardware wallet signer.
 *
 * We can't talk to a real Ledger in CI, so each test injects a mock
 * `spawn` that:
 *   - Captures the bin, args, and options
 *   - Returns a fake child process whose stdout emits the signature
 *     and whose `close` event fires with exit code 0
 *
 * The goal is to pin the exact CLI invocation, so any regression in
 * argument shape (e.g. missing `-k`, wrong message placement) is caught.
 */

import { describe, expect, it, vi } from 'vitest';

import { signWithHardwareWallet } from './signing-hardware.js';
import { prepareMessage } from './signing.js';

interface FakeChild {
  stdout: { on: (event: 'data', cb: (chunk: Buffer) => void) => void };
  stderr: { on: (event: 'data', cb: (chunk: Buffer) => void) => void };
  on: (event: 'close' | 'error', cb: (arg: number | Error) => void) => void;
}

function makeFakeSpawn(options: {
  stdoutLines: string[];
  exitCode?: number;
  throwOnSpawn?: boolean;
}): {
  spawn: (
    bin: string,
    args: string[],
    opts?: Record<string, unknown>,
  ) => FakeChild;
  calls: Array<{ bin: string; args: string[]; opts?: Record<string, unknown> }>;
} {
  const calls: Array<{
    bin: string;
    args: string[];
    opts?: Record<string, unknown>;
  }> = [];

  const spawn = (
    bin: string,
    args: string[],
    opts?: Record<string, unknown>,
  ): FakeChild => {
    calls.push({ bin, args, opts });
    if (options.throwOnSpawn) {
      throw new Error('spawn failed synchronously');
    }

    const stdoutListeners: Array<(chunk: Buffer) => void> = [];
    const closeListeners: Array<(code: number) => void> = [];
    const errorListeners: Array<(err: Error) => void> = [];

    setTimeout(() => {
      for (const cb of stdoutListeners) {
        cb(Buffer.from(options.stdoutLines.join('\n'), 'utf-8'));
      }
      for (const cb of closeListeners) {
        cb(options.exitCode ?? 0);
      }
      void errorListeners;
    }, 0);

    return {
      stdout: {
        on: (event, cb) => {
          if (event === 'data') stdoutListeners.push(cb);
        },
      },
      stderr: {
        on: () => {
          /* noop */
        },
      },
      on: (event, cb) => {
        if (event === 'close') closeListeners.push(cb as (code: number) => void);
        if (event === 'error') errorListeners.push(cb as (err: Error) => void);
      },
    };
  };

  return { spawn, calls };
}

describe('signWithHardwareWallet', () => {
  it('invokes `solana sign-offchain-message -k <ledgerPath> <canonicalMessage>` with the correct args', async () => {
    const header = {
      type: 'transfer_funds',
      timestamp: 1000,
      expiry_window: 5000,
    };
    const payload = { to_account: 'AABBCC', amount: '420.69' };
    const fakeSignature = 'FAKE_SIG_BASE58';
    const { spawn, calls } = makeFakeSpawn({
      stdoutLines: ['approval preamble', fakeSignature],
    });

    const result = await signWithHardwareWallet(
      header,
      payload,
      'usb://ledger?key=1',
      { spawnImpl: spawn as unknown as typeof import('node:child_process').spawn },
    );

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.bin).toBe('solana');
    expect(call.args[0]).toBe('sign-offchain-message');
    expect(call.args[1]).toBe('-k');
    expect(call.args[2]).toBe('usb://ledger?key=1');
    // Last arg must be the exact canonical JSON message.
    expect(call.args[3]).toBe(prepareMessage(header, payload));
    expect(call.opts).toEqual({ shell: false });

    expect(result.signature).toBe(fakeSignature);
    expect(result.message).toBe(prepareMessage(header, payload));
  });

  it('rejects if the CLI exits non-zero', async () => {
    const { spawn } = makeFakeSpawn({
      stdoutLines: ['some error'],
      exitCode: 1,
    });
    await expect(
      signWithHardwareWallet(
        { type: 'x', timestamp: 1, expiry_window: 5000 },
        {},
        'usb://ledger?key=1',
        { spawnImpl: spawn as unknown as typeof import('node:child_process').spawn },
      ),
    ).rejects.toThrow();
  });

  it('rejects when ledgerPath is empty', async () => {
    await expect(
      signWithHardwareWallet(
        { type: 'x', timestamp: 1, expiry_window: 5000 },
        {},
        '',
      ),
    ).rejects.toThrow();
  });

  it('extracts the last non-empty line as the signature', async () => {
    const { spawn } = makeFakeSpawn({
      stdoutLines: ['line 1', 'line 2', 'real_sig_xyz'],
    });
    const result = await signWithHardwareWallet(
      { type: 'x', timestamp: 1, expiry_window: 5000 },
      {},
      'usb://ledger?key=1',
      { spawnImpl: spawn as unknown as typeof import('node:child_process').spawn },
    );
    expect(result.signature).toBe('real_sig_xyz');
  });
});

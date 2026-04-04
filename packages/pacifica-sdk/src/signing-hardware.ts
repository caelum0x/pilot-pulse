/**
 * Hardware wallet (Ledger) signing support.
 *
 * Mirrors the Python reference `sign_with_hardware_wallet` in
 * `vendor/python-sdk/common/utils.py`, which shells out to the
 * `solana` CLI's `sign-offchain-message` subcommand:
 *
 *     solana sign-offchain-message -k <ledger-path> <message>
 *
 * The CLI prints an approval prompt to stderr and writes the final base58
 * signature to stdout as the last line. We capture stdout, trim, and return
 * the last line as the signature — exactly the same extraction the Python
 * helper performs.
 *
 * Node-only. Guarded by a `typeof process !== 'undefined'` check so the
 * bundle stays browser-safe when this module is not imported.
 */

import { spawn } from 'node:child_process';

import { PacificaSigningError } from './errors.js';
import { prepareMessage, type SignHeader, type SignedMessage } from './signing.js';

/**
 * Injectable spawn for tests — matches the minimal surface of Node's
 * `child_process.spawn` that we actually use (args, stdout/stderr streams,
 * exit event). Tests pass a mock so we never touch a real `solana` binary.
 */
export type SpawnFn = typeof spawn;

export interface SignWithHardwareWalletOptions {
  /** Override the spawn implementation (for tests). */
  spawnImpl?: SpawnFn;
  /** Override the binary name/path. Defaults to `'solana'`. */
  solanaBin?: string;
}

interface StreamLike {
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
}

interface ChildLike {
  stdout: StreamLike | null;
  stderr: StreamLike | null;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
}

function assertNodeEnv(): void {
  if (typeof process === 'undefined' || !process?.versions?.node) {
    throw new PacificaSigningError(
      'Hardware wallet signing is Node-only and not available in this environment',
    );
  }
}

/**
 * Sign a Pacifica canonical message with a Ledger hardware wallet.
 *
 * Returns the same `{ message, signature }` shape as `signMessage`, so
 * callers that thread either signer through a common code path don't need
 * to branch.
 */
export async function signWithHardwareWallet(
  header: SignHeader,
  payload: unknown,
  ledgerPath: string,
  opts: SignWithHardwareWalletOptions = {},
): Promise<SignedMessage> {
  if (!ledgerPath) {
    throw new PacificaSigningError(
      'ledgerPath is required for hardware wallet signing',
    );
  }

  assertNodeEnv();

  const message = prepareMessage(header, payload);
  const bin = opts.solanaBin ?? 'solana';
  const args = ['sign-offchain-message', '-k', ledgerPath, message];

  const spawnImpl = opts.spawnImpl ?? spawn;
  // The real spawn returns a ChildProcess; SpawnFn's signature is identical
  // and ChildProcess matches our ChildLike minimal interface at runtime.
  const child = spawnImpl(bin, args, { shell: false }) as unknown as ChildLike;

  return new Promise<SignedMessage>((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const appendStdout = (chunk: Buffer | string): void => {
      stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    };
    const appendStderr = (chunk: Buffer | string): void => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    };

    child.stdout?.on('data', appendStdout);
    child.stderr?.on('data', appendStderr);

    child.on('error', (err: Error) => {
      reject(
        new PacificaSigningError(
          `Failed to spawn solana CLI: ${err.message}`,
        ),
      );
    });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(
          new PacificaSigningError(
            `Ledger signing failed (exit ${code ?? 'null'}): ${stderr.trim() || stdout.trim()}`,
          ),
        );
        return;
      }

      // The solana CLI prints the approval preamble followed by the base58
      // signature on its own line. The Python reference takes the LAST line
      // of trimmed stdout — we do the same for byte-for-byte parity.
      const lines = stdout.trim().split(/\r?\n/);
      const signature = lines[lines.length - 1];
      if (!signature) {
        reject(
          new PacificaSigningError(
            'Solana CLI produced empty output — cannot extract signature',
          ),
        );
        return;
      }
      resolve({ message, signature });
    });
  });
}

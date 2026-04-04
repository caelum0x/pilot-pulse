/**
 * Pacifica on-chain USDC deposit.
 *
 * Ported from `vendor/python-sdk/rest/deposit.py`. This is a Solana
 * transaction (not a REST call), so it lives in a separate module and
 * only pulls in `@solana/web3.js`. Core SDK consumers that never deposit
 * can tree-shake this out.
 *
 * The instruction matches Pacifica's Anchor program:
 *   - Discriminator: sha256("global:deposit")[:8]
 *   - Data: Borsh u64 (amount in USDC base units, 6 decimals)
 *   - 10 account metas in fixed order
 *
 * This module is Node-only — it imports `node:crypto`. Browser callers
 * should build transactions via `buildDepositInstruction` and sign/send
 * using their own wallet adapter rather than calling `deposit()`.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  type AccountMeta,
  SystemProgram,
  sendAndConfirmTransaction,
  type Commitment,
} from '@solana/web3.js';
import { createHash } from 'node:crypto';
import bs58 from 'bs58';

// ---- Program constants (copied verbatim from vendor/python-sdk/rest/deposit.py) ----

/** Pacifica Anchor program id on Solana mainnet. */
export const PACIFICA_PROGRAM_ID = new PublicKey(
  'PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH',
);

/** Pacifica central state account (writable, non-signer). */
export const PACIFICA_CENTRAL_STATE = new PublicKey(
  '9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY',
);

/** Pacifica vault account that receives deposited USDC. */
export const PACIFICA_VAULT = new PublicKey(
  '72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa',
);

/** Circle USDC SPL mint on Solana mainnet. */
export const USDC_MINT_MAINNET = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
);

/** Canonical SPL Token program id. */
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);

/** Canonical SPL Associated Token Account program id. */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

/** USDC has 6 decimals on Solana. */
export const USDC_DECIMALS = 6;

/** Minimum deposit amount in whole USDC, per Pacifica program rules. */
export const MIN_DEPOSIT_USDC = 10;

/** Default mainnet-beta RPC URL (matches the Python reference). */
export const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

/** Anchor event authority seed. */
const EVENT_AUTHORITY_SEED = '__event_authority';

// ---- Public types ----

export interface DepositOptions {
  /** Base58-encoded Solana secret key (64 bytes). */
  privateKey: string;
  /** USDC amount to deposit in human units (e.g. 100.5 means 100.5 USDC). */
  amount: number;
  /** Optional RPC URL override. Defaults to mainnet-beta. */
  rpcUrl?: string;
  /** Optional commitment level. Defaults to 'confirmed'. */
  commitment?: Commitment;
  /** Optional override for the USDC mint (useful on testnets/devnet). */
  usdcMint?: PublicKey;
  /** Optional pre-built Connection (for tests). Overrides rpcUrl. */
  connection?: Connection;
}

export interface DepositResult {
  /** Transaction signature returned by the RPC node. */
  signature: string;
  /** Amount requested in human USDC units. */
  amount: number;
  /** Amount in base units (6-decimal USDC). */
  amountRaw: bigint;
  /** Base58-encoded depositor public key. */
  depositor: string;
}

// ---- Internal helpers (exported for testability) ----

/**
 * Compute an Anchor instruction discriminator: `sha256("global:<ix_name>")[:8]`.
 *
 * Matches the Python reference:
 *   hashlib.sha256(f"global:{name}".encode()).digest()[:8]
 */
export function anchorDiscriminator(ixName: string): Buffer {
  const digest = createHash('sha256').update(`global:${ixName}`).digest();
  return digest.subarray(0, 8);
}

/**
 * Derive the Associated Token Address (SPL ATA) for an owner / mint pair.
 *
 * Reimplemented here so we don't have to pull in `@solana/spl-token`. The
 * seed layout matches Solana's canonical ATA program:
 *   [owner, token_program, mint] → ATA (ATokenGPv...)
 */
export function getAssociatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}

/**
 * Derive the Pacifica program's event_authority PDA.
 *
 * Anchor programs expose an `__event_authority` PDA for CPI event emission.
 * This is a single-seed derivation against `PACIFICA_PROGRAM_ID`.
 */
export function getPacificaEventAuthority(): PublicKey {
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from(EVENT_AUTHORITY_SEED)],
    PACIFICA_PROGRAM_ID,
  );
  return eventAuthority;
}

/**
 * Build the instruction data for `deposit(amount: u64)`.
 *
 * Layout: `[discriminator(8) || amount_le_u64(8)]`. Borsh's `u64` encoding
 * is just little-endian, so we can skip a borsh dep and write the bytes
 * directly.
 */
export function buildDepositInstructionData(amountRaw: bigint): Buffer {
  const disc = anchorDiscriminator('deposit');
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amountRaw, 0);
  return Buffer.concat([disc, amountBuf]);
}

/**
 * Convert a human USDC amount (e.g. 4200.69) to raw base units (6 decimals),
 * using the same `round(amount * 1_000_000)` semantics as the Python SDK.
 */
export function toUsdcRawAmount(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

/**
 * Build the 10-account meta list in the exact order the Pacifica program
 * expects. Order and writable/signer flags are load-bearing — do not reorder.
 */
export function buildDepositAccounts(
  depositor: PublicKey,
  usdcMint: PublicKey,
): AccountMeta[] {
  const eventAuthority = getPacificaEventAuthority();
  const depositorUsdcAta = getAssociatedTokenAddress(depositor, usdcMint);

  return [
    { pubkey: depositor, isSigner: true, isWritable: true },
    { pubkey: depositorUsdcAta, isSigner: false, isWritable: true },
    { pubkey: PACIFICA_CENTRAL_STATE, isSigner: false, isWritable: true },
    { pubkey: PACIFICA_VAULT, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: usdcMint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PACIFICA_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
}

/**
 * Build the full deposit `TransactionInstruction`. Callers that want to add
 * priority fees, compute budget ixs, or bundle with other transactions should
 * use this directly rather than `deposit()`.
 *
 * Throws if `amount < MIN_DEPOSIT_USDC`.
 */
export function buildDepositInstruction(
  depositor: PublicKey,
  amount: number,
  usdcMint: PublicKey = USDC_MINT_MAINNET,
): TransactionInstruction {
  if (amount < MIN_DEPOSIT_USDC) {
    throw new Error(
      `Pacifica deposit amount must be at least ${MIN_DEPOSIT_USDC} USDC (got ${amount})`,
    );
  }
  const amountRaw = toUsdcRawAmount(amount);
  return new TransactionInstruction({
    programId: PACIFICA_PROGRAM_ID,
    keys: buildDepositAccounts(depositor, usdcMint),
    data: buildDepositInstructionData(amountRaw),
  });
}

/**
 * End-to-end: load keypair, build the deposit instruction, sign, and submit.
 *
 * Mirrors the behavior of `vendor/python-sdk/rest/deposit.py::main`. The
 * returned `DepositResult` includes the tx signature and the raw amount so
 * callers can log or persist it.
 */
export async function deposit(opts: DepositOptions): Promise<DepositResult> {
  const secretKey = bs58.decode(opts.privateKey);
  if (secretKey.length !== 64) {
    throw new Error(
      `Invalid Solana secret key length: expected 64 bytes, got ${secretKey.length}`,
    );
  }
  const keypair = Keypair.fromSecretKey(secretKey);

  const connection =
    opts.connection ??
    new Connection(
      opts.rpcUrl ?? DEFAULT_SOLANA_RPC_URL,
      opts.commitment ?? 'confirmed',
    );

  const usdcMint = opts.usdcMint ?? USDC_MINT_MAINNET;
  const ix = buildDepositInstruction(keypair.publicKey, opts.amount, usdcMint);
  const tx = new Transaction().add(ix);

  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [keypair],
    { commitment: opts.commitment ?? 'confirmed' },
  );

  return {
    signature,
    amount: opts.amount,
    amountRaw: toUsdcRawAmount(opts.amount),
    depositor: keypair.publicKey.toBase58(),
  };
}

/**
 * Unit tests for `rest-deposit.ts`.
 *
 * These tests are network-free: they only exercise the pure helpers that
 * build the Anchor-style deposit instruction. End-to-end submission via
 * `deposit()` is covered manually against a real RPC endpoint — mocking
 * `sendAndConfirmTransaction` is intentionally out of scope here because
 * it would assert implementation details of `@solana/web3.js` rather than
 * Pacifica's wire format.
 */

import { describe, expect, it } from 'vitest';
import { PublicKey, SystemProgram } from '@solana/web3.js';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MIN_DEPOSIT_USDC,
  PACIFICA_CENTRAL_STATE,
  PACIFICA_PROGRAM_ID,
  PACIFICA_VAULT,
  TOKEN_PROGRAM_ID,
  USDC_DECIMALS,
  USDC_MINT_MAINNET,
  anchorDiscriminator,
  buildDepositAccounts,
  buildDepositInstruction,
  buildDepositInstructionData,
  getAssociatedTokenAddress,
  getPacificaEventAuthority,
  toUsdcRawAmount,
} from './rest-deposit.js';

// Precomputed expected values — hand-derived so the tests will fail loudly
// if the discriminator/encoding/ATA logic ever drifts from the Python SDK.
// Expected sha256('global:deposit')[:8] as hex.
const EXPECTED_DEPOSIT_DISCRIMINATOR_HEX = 'f223c68952e1f2b6';

// A deterministic 32-byte owner pubkey (all 0x07) for ATA derivation tests.
// Both the base58 form and the derived ATA are stable across runs.
const DETERMINISTIC_OWNER = new PublicKey(Buffer.alloc(32, 7));
const EXPECTED_DETERMINISTIC_OWNER_BASE58 =
  'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx';
const EXPECTED_DETERMINISTIC_USDC_ATA =
  '7EJSueeCjseYzghxU2XhcGEUn7RJDh43Z2dL6dvGy9mw';
const EXPECTED_EVENT_AUTHORITY = '2cPFdP7ADcdQE2rG9BqASYAVosZv3PX5yCyTdYCfGq8V';

describe('anchorDiscriminator', () => {
  it('returns exactly 8 bytes', () => {
    const disc = anchorDiscriminator('deposit');
    expect(disc).toHaveLength(8);
  });

  it('matches the hand-computed sha256("global:deposit")[:8]', () => {
    const disc = anchorDiscriminator('deposit');
    expect(disc.toString('hex')).toBe(EXPECTED_DEPOSIT_DISCRIMINATOR_HEX);
  });

  it('is stable and deterministic for different instruction names', () => {
    const a = anchorDiscriminator('withdraw');
    const b = anchorDiscriminator('withdraw');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(anchorDiscriminator('deposit'))).toBe(false);
  });
});

describe('toUsdcRawAmount', () => {
  it('converts whole USDC to 6-decimal base units', () => {
    expect(toUsdcRawAmount(10)).toBe(10_000_000n);
    expect(toUsdcRawAmount(100)).toBe(100_000_000n);
  });

  it('rounds fractional amounts to the nearest microdollar (matches Python)', () => {
    // Python: int(round(100.5 * 1_000_000)) → 100_500_000
    expect(toUsdcRawAmount(100.5)).toBe(100_500_000n);
    // Python: int(round(4200.69 * 1_000_000)) → 4_200_690_000
    expect(toUsdcRawAmount(4200.69)).toBe(4_200_690_000n);
  });
});

describe('buildDepositInstructionData', () => {
  it('returns 16 bytes: 8 discriminator + 8 u64 amount', () => {
    const data = buildDepositInstructionData(42_000_000n);
    expect(data).toHaveLength(16);
  });

  it('starts with the correct deposit discriminator', () => {
    const data = buildDepositInstructionData(42_000_000n);
    expect(data.subarray(0, 8).toString('hex')).toBe(
      EXPECTED_DEPOSIT_DISCRIMINATOR_HEX,
    );
  });

  it('encodes 42 USDC (42_000_000 raw) as little-endian u64', () => {
    // 42_000_000 decimal = 0x02_80_DE_80 little-endian over 8 bytes
    const data = buildDepositInstructionData(42_000_000n);
    expect(data.subarray(8).toString('hex')).toBe('80de800200000000');
  });

  it('encodes 4200.69 USDC (4_200_690_000 raw) as little-endian u64', () => {
    // Hand-computed: 4_200_690_000 → LE bytes 50 71 61 fa 00 00 00 00
    const data = buildDepositInstructionData(4_200_690_000n);
    expect(data.subarray(8).toString('hex')).toBe('507161fa00000000');
  });

  it('round-trips through writeBigUInt64LE/readBigUInt64LE', () => {
    const raw = 123_456_789n;
    const data = buildDepositInstructionData(raw);
    const decoded = data.subarray(8).readBigUInt64LE(0);
    expect(decoded).toBe(raw);
  });
});

describe('getAssociatedTokenAddress', () => {
  it('produces the expected deterministic ATA for a fixed owner/mint', () => {
    expect(DETERMINISTIC_OWNER.toBase58()).toBe(
      EXPECTED_DETERMINISTIC_OWNER_BASE58,
    );
    const ata = getAssociatedTokenAddress(
      DETERMINISTIC_OWNER,
      USDC_MINT_MAINNET,
    );
    expect(ata.toBase58()).toBe(EXPECTED_DETERMINISTIC_USDC_ATA);
  });

  it('is stable across repeat calls', () => {
    const a = getAssociatedTokenAddress(DETERMINISTIC_OWNER, USDC_MINT_MAINNET);
    const b = getAssociatedTokenAddress(DETERMINISTIC_OWNER, USDC_MINT_MAINNET);
    expect(a.equals(b)).toBe(true);
  });
});

describe('getPacificaEventAuthority', () => {
  it('derives a deterministic PDA from the Pacifica program id', () => {
    expect(getPacificaEventAuthority().toBase58()).toBe(
      EXPECTED_EVENT_AUTHORITY,
    );
  });
});

describe('buildDepositAccounts', () => {
  it('returns exactly 10 accounts in the documented order', () => {
    const accounts = buildDepositAccounts(
      DETERMINISTIC_OWNER,
      USDC_MINT_MAINNET,
    );
    expect(accounts).toHaveLength(10);
  });

  it('puts the depositor first as signer + writable', () => {
    const accounts = buildDepositAccounts(
      DETERMINISTIC_OWNER,
      USDC_MINT_MAINNET,
    );
    const depositor = accounts[0]!;
    expect(depositor.pubkey.equals(DETERMINISTIC_OWNER)).toBe(true);
    expect(depositor.isSigner).toBe(true);
    expect(depositor.isWritable).toBe(true);
  });

  it('puts the depositor USDC ATA second as writable non-signer', () => {
    const accounts = buildDepositAccounts(
      DETERMINISTIC_OWNER,
      USDC_MINT_MAINNET,
    );
    const ata = accounts[1]!;
    expect(ata.pubkey.toBase58()).toBe(EXPECTED_DETERMINISTIC_USDC_ATA);
    expect(ata.isSigner).toBe(false);
    expect(ata.isWritable).toBe(true);
  });

  it('places CENTRAL_STATE (writable) and VAULT (writable) in slots 3 and 4', () => {
    const accounts = buildDepositAccounts(
      DETERMINISTIC_OWNER,
      USDC_MINT_MAINNET,
    );
    const central = accounts[2]!;
    const vault = accounts[3]!;
    expect(central.pubkey.equals(PACIFICA_CENTRAL_STATE)).toBe(true);
    expect(central.isSigner).toBe(false);
    expect(central.isWritable).toBe(true);
    expect(vault.pubkey.equals(PACIFICA_VAULT)).toBe(true);
    expect(vault.isSigner).toBe(false);
    expect(vault.isWritable).toBe(true);
  });

  it('places program/system/mint accounts as read-only in the documented order', () => {
    const accounts = buildDepositAccounts(
      DETERMINISTIC_OWNER,
      USDC_MINT_MAINNET,
    );
    // Slots 5..10: token, ata program, mint, system, event authority, program
    expect(accounts[4]!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(accounts[5]!.pubkey.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(accounts[6]!.pubkey.equals(USDC_MINT_MAINNET)).toBe(true);
    expect(accounts[7]!.pubkey.equals(SystemProgram.programId)).toBe(true);
    expect(accounts[8]!.pubkey.toBase58()).toBe(EXPECTED_EVENT_AUTHORITY);
    expect(accounts[9]!.pubkey.equals(PACIFICA_PROGRAM_ID)).toBe(true);

    for (const idx of [4, 5, 6, 7, 8, 9]) {
      expect(accounts[idx]!.isSigner).toBe(false);
      expect(accounts[idx]!.isWritable).toBe(false);
    }
  });
});

describe('buildDepositInstruction', () => {
  it('throws when amount is below the minimum deposit', () => {
    expect(() =>
      buildDepositInstruction(DETERMINISTIC_OWNER, MIN_DEPOSIT_USDC - 0.01),
    ).toThrow(/at least 10 USDC/);
  });

  it('accepts exactly the minimum deposit amount', () => {
    expect(() =>
      buildDepositInstruction(DETERMINISTIC_OWNER, MIN_DEPOSIT_USDC),
    ).not.toThrow();
  });

  it('encodes 100.5 USDC as 100_500_000 raw base units', () => {
    const ix = buildDepositInstruction(DETERMINISTIC_OWNER, 100.5);
    const rawBytes = Buffer.from(ix.data).subarray(8);
    expect(rawBytes.readBigUInt64LE(0)).toBe(100_500_000n);
  });

  it('uses the Pacifica program id and 10 accounts', () => {
    const ix = buildDepositInstruction(DETERMINISTIC_OWNER, 25);
    expect(ix.programId.equals(PACIFICA_PROGRAM_ID)).toBe(true);
    expect(ix.keys).toHaveLength(10);
  });

  it('honors a USDC mint override (devnet/testnet support)', () => {
    // Devnet USDC mint (arbitrary valid SPL mint for the test).
    const devnetUsdc = new PublicKey(
      '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    );
    const ix = buildDepositInstruction(DETERMINISTIC_OWNER, 25, devnetUsdc);
    // Slot 6 is the mint.
    expect(ix.keys[6]!.pubkey.equals(devnetUsdc)).toBe(true);
    // Slot 1 is the owner's ATA, which should now be derived against the
    // override mint, not mainnet USDC.
    const mainnetAta = getAssociatedTokenAddress(
      DETERMINISTIC_OWNER,
      USDC_MINT_MAINNET,
    );
    expect(ix.keys[1]!.pubkey.equals(mainnetAta)).toBe(false);
  });
});

describe('module constants', () => {
  it('exposes USDC_DECIMALS = 6 and MIN_DEPOSIT_USDC = 10', () => {
    expect(USDC_DECIMALS).toBe(6);
    expect(MIN_DEPOSIT_USDC).toBe(10);
  });

  it('exposes the canonical Pacifica/USDC/SPL program ids', () => {
    expect(PACIFICA_PROGRAM_ID.toBase58()).toBe(
      'PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH',
    );
    expect(PACIFICA_CENTRAL_STATE.toBase58()).toBe(
      '9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY',
    );
    expect(PACIFICA_VAULT.toBase58()).toBe(
      '72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa',
    );
    expect(USDC_MINT_MAINNET.toBase58()).toBe(
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    expect(TOKEN_PROGRAM_ID.toBase58()).toBe(
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    );
    expect(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()).toBe(
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    );
  });
});

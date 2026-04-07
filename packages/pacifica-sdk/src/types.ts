/**
 * Pacifica domain types.
 *
 * Kept intentionally minimal: only the fields the SDK consumers need.
 * Unknown-shaped responses use `unknown` so callers are forced to narrow
 * explicitly instead of letting `any` leak through the surface.
 *
 * Field names use the canonical snake_case wire format because they are
 * signed as part of the canonical JSON payload — renaming them to camelCase
 * would produce signatures the API rejects.
 */

export type Side = 'bid' | 'ask';
export type TimeInForce = 'GTC' | 'IOC' | 'ALO';
export type CandleInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type OrderType = 'limit' | 'market' | 'stop';

// ============================================================
// Read models (responses)
// ============================================================

export interface MarketInfo {
  symbol: string;
  max_leverage: number;
  min_order_size: string;
  max_order_size: string;
  tick_size: string;
  lot_size: string;
  isolated_only: boolean;
  funding_rate: string;
  next_funding_rate: string;
  instrument_type: string;
  base_asset: string;
  created_at: number;
}

export interface Position {
  symbol: string;
  side: Side;
  amount: string;
  entryPrice: string;
  margin: string;
  isolated: boolean;
  createdAt: string;
}

export interface OpenOrder {
  orderId: number;
  symbol: string;
  side: Side;
  orderType: OrderType;
  tickLevel: number;
  initialAmount: string;
  remainingAmount: string;
  reduceOnly: boolean;
  createdAt: string;
}

export interface AccountInfo {
  balance: string;
  feeLevel: number;
}

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface OrderbookSnapshot {
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

// ============================================================
// Order parameters
// ============================================================

export interface CreateMarketOrderParams {
  symbol: string;
  side: Side;
  amount: string;
  slippage_percent: string;
  reduce_only?: boolean;
  client_order_id?: string;
  builder_code?: string;
}

export interface CreateLimitOrderParams {
  symbol: string;
  side: Side;
  amount: string;
  price: string;
  tif: TimeInForce;
  reduce_only?: boolean;
  client_order_id?: string;
  builder_code?: string;
}

export interface CreateOrderResponse {
  orderId: number;
}

// ============================================================
// Position TP/SL
// ============================================================

/**
 * A single take-profit or stop-loss leg for {@link CreatePositionTpSlParams}.
 *
 * - `stop_price` is required and defines the trigger.
 * - `limit_price` is optional — omit it to place a market order at trigger.
 * - `amount` is optional — omit it to use the full position size.
 * - `client_order_id` is optional.
 */
export interface PositionTpSlLeg {
  stop_price: string;
  limit_price?: string;
  amount?: string;
  client_order_id?: string;
}

export interface CreatePositionTpSlParams {
  symbol: string;
  /**
   * Side of the *closing* order. For a long position use `ask`; for a short
   * position use `bid`.
   */
  side: Side;
  take_profit?: PositionTpSlLeg;
  stop_loss?: PositionTpSlLeg;
}

// ============================================================
// TWAP orders
// ============================================================

export interface CreateTwapOrderParams {
  symbol: string;
  side: Side;
  amount: string;
  slippage_percent: string;
  /** Total TWAP duration in seconds across all sub-orders. */
  duration_in_seconds: number;
  reduce_only?: boolean;
  client_order_id?: string;
  builder_code?: string;
}

export interface CancelTwapOrderParams {
  symbol: string;
  order_id?: number;
  client_order_id?: string;
}

// ============================================================
// Batch orders
// ============================================================

/**
 * A single entry inside a batch-order envelope. Each entry carries its own
 * signed request body (with account/signature/timestamp/expiry_window),
 * which must be built by signing the entry's payload with the caller's key.
 */
export type BatchOrderAction =
  | {
      type: 'Create';
      params: CreateLimitOrderParams;
    }
  | {
      type: 'CreateMarket';
      params: CreateMarketOrderParams;
    }
  | {
      type: 'Cancel';
      params: { symbol: string; order_id?: number; client_order_id?: string };
    };

// ============================================================
// Subaccounts
// ============================================================

export interface Subaccount {
  address: string;
  balance: string;
  fee_level: number;
  fee_mode: string;
  created_at: string;
}

export interface CreateSubaccountParams {
  /**
   * Base58 Solana secret key (64 bytes) for the subaccount. Must be provided
   * separately from the client's main `privateKey` because the subaccount
   * creation protocol requires signatures from BOTH keys.
   */
  subaccountPrivateKey: string;
  /** Optional — overrides the default 5000ms expiry window. */
  expiryWindowMs?: number;
}

export interface CreateSubaccountHardwareParams {
  /** Subaccount's base58 private key — signs the initiate leg. */
  subaccountPrivateKey: string;
  /**
   * Hardware-wallet public key that owns the main account. The confirm leg
   * is signed by the ledger path configured on the client.
   */
  mainHardwarePublicKey: string;
  expiryWindowMs?: number;
}

export interface TransferSubaccountFundParams {
  to_account: string;
  amount: string;
}

// ============================================================
// Agent wallets
// ============================================================

export interface BindAgentWalletParams {
  agent_wallet: string;
}

export interface RevokeAgentWalletParams {
  agent_wallet: string;
}

export interface AgentIpWhitelistListParams {
  /** The agent key being inspected — sent as `api_agent_key` on the wire. */
  api_agent_key: string;
}

export interface AgentIpWhitelistMutateParams {
  agent_wallet: string;
  ip_address: string;
}

export interface AgentIpWhitelistToggleParams {
  agent_wallet: string;
  enabled: boolean;
}

// ============================================================
// API config keys
// ============================================================

export interface RevokeApiConfigKeyParams {
  api_key: string;
}

// ============================================================
// Lakes
// ============================================================

export interface CreateLakeParams {
  /** Base58 Solana pubkey of the lake manager. */
  manager: string;
  /** Optional display nickname. */
  nickname?: string;
}

export interface LakeDepositParams {
  lake: string;
  amount: string;
}

export interface LakeWithdrawParams {
  lake: string;
  shares: string;
}

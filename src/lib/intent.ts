/**
 * Core interfaces for message-centric state operations
 */

import {
  ClarityValue,
  PostCondition,
  PostConditionMode,
} from '@stacks/transactions';

/**
 * Intent for querying blockchain state (read-only)
 */
export interface QueryIntent {
  contract: string;
  function: string;
  args: ClarityValue[];
}

/**
 * Intent for mutating blockchain state (write operation)
 * Requires additional authentication and transaction details
 */
export interface MutateIntent extends QueryIntent {
  options: {
    fee?: number;
    nonce?: number;
    network?: 'mainnet' | 'testnet';
    privateKey?: string;
    postConditions?: PostCondition[];
    postConditionMode?: PostConditionMode;
    sponsored?: boolean;
  };
}

/**
 * Result of a query operation
 */
export interface QueryResult {
  /**
   * Status of the operation
   */
  status: 'success' | 'error';

  /**
   * Data returned by the operation
   */
  data?: any;

  /**
   * Error information if the operation failed
   */
  error?: {
    message: string;
    code?: number;
    details?: any;
  };
}

/**
 * Result of a mutation operation
 */
export interface MutateResult {
  /**
   * Status of the operation
   */
  status: 'pending' | 'success' | 'error';

  /**
   * Transaction ID for the mutation
   */
  txId?: string;

  /**
   * Error information if the operation failed
   */
  error?: {
    message: string;
    code?: number;
    details?: any;
  };
}

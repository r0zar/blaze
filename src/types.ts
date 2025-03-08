import { PostCondition } from "@stacks/transactions";

// Transaction type definitions
export enum TransactionType {
    TRANSFER = 'transfer',
    PREDICT = 'predict',
    CLAIM_REWARD = 'claim-reward',
}

// Core types
export interface TransferOptions {
    to: string;
    amount: number;
}

export interface PredictionOptions {
    marketId: number;
    outcomeId: number;
    amount: number;
}

export interface ClaimRewardOptions {
    receiptId: number;
}

export interface TxRequest {
    conditions: PostCondition[],
    function: {
        name: string,
        args: string[],
    },
    nonce: number;
    signature: string;
}

export interface TransactionRequest {
    type: TransactionType;
    signature: string;
    signer: string;
    nonce: number;
}
export interface Transfer extends TransactionRequest {
    type: TransactionType.TRANSFER;
    signature: string;
    signer: string;
    to: string;
    amount: number;
    nonce: number;
}

export interface Prediction extends TransactionRequest {
    type: TransactionType.PREDICT;
    signature: string;
    signer: string;
    marketId: number;
    outcomeId: number;
    amount: number;
    nonce: number;
}

export interface ClaimReward extends TransactionRequest {
    type: TransactionType.CLAIM_REWARD;
    signature: string;
    signer: string;
    receiptId: number;
    nonce: number;
}

export interface FinishedTxData {
    txId: string;
}

export interface TransactionResult {
    txid: string;
}

export interface Status {
    subnet: `${string}.${string}`;
    txQueue: any[]; // Using any instead of Transaction to avoid circular dependency
    lastProcessedBlock?: number;
}

export interface TransferMessage {
    to: string;
    amount: number;
    nonce: number;
}

export interface PredictionMessage {
    marketId: number;
    outcomeId: number;
    amount: number;
    nonce: number;
}

export interface ClaimRewardMessage {
    receiptId: number;
    nonce: number;
}

export interface DepositOptions {
    subnet: `${string}.${string}`;
    amount: number;
    signer: string;
}

export interface WithdrawOptions {
    subnet: `${string}.${string}`;
    amount: number;
    signer: string;
}

export interface ServerConfig {
    privateKey: string | undefined;
}

// Base transaction interfaces
export interface BaseTransaction {
    type: TransactionType;
    affectedUsers: string[];
    getBalanceChanges(): Map<string, number>;
    toClarityValue(): any;
} 
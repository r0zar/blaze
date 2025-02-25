import { PostCondition } from "@stacks/transactions";

// Transaction type definitions
export enum TransactionType {
    TRANSFER = 'transfer',
    // Future transaction types
    // MINT = 'mint',
    // SWAP = 'swap',
}

// Core types
export interface TransferOptions {
    to: string;
    amount: number;
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

export interface Transfer {
    signature: string;
    signer: string;
    to: string;
    amount: number;
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

export interface BlazeMessage {
    to: string;
    amount: number;
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
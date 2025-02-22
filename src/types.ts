import { PostCondition } from "@stacks/transactions";
import { Transaction } from "./server";

// Core types
export interface Balance {
    total: number;
    confirmed?: number;
    unconfirmed?: number;
}

export interface BalanceOptions {
    includeConfirmed?: boolean;
    includeUnconfirmed?: boolean;
}

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
    subnet: string;
    txQueue: Transaction[];
    lastProcessedBlock?: number;
}

export interface BlazeMessage {
    to: string;
    amount: number;
    nonce: number;
}

export interface DepositOptions {
    subnet: string;
    amount: number;
    signer: string;
}

export interface WithdrawOptions {
    subnet: string;
    amount: number;
}

export interface ServerConfig {
    privateKey: string | undefined;
}

// Event types
export type EventType = 'transfer' | 'deposit' | 'withdraw' | 'balance' | 'batch';

export interface BlazeEvent {
    type: EventType;
    contract: string;
    data: {
        from?: string;
        to?: string;
        amount?: number;
        txid?: string;
        balance?: Balance;
        status?: 'pending' | 'processing' | 'completed' | 'failed';
        error?: string;
        timestamp: number;
    };
}

export interface EventSubscription {
    unsubscribe: () => void;
} 
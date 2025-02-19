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

export interface TransactionResult {
    txid: string;
}

export interface FinishedTxData {
    txId: string;
}

export interface Transfer {
    signature: string;
    signer: string;
    to: string;
    amount: number;
    nonce: number;
}

export interface BatchTransferOptions {
    contract: string;
    operations: Transfer[];
    privateKey: string;
}

export interface Status {
    contracts: string[];
    queueSizes: { [contract: string]: number };
    lastProcessedBlock?: number;
}

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

// Client to Server Events
export type ClientEventType = 'client_transfer' | 'client_deposit' | 'client_withdraw' | 'subscribe_balance';

export interface ClientEvent {
    type: ClientEventType;
    contract: string;
    signer: string;
    data: {
        amount?: number;
        txid?: string;
        timestamp: number;
    };
} 
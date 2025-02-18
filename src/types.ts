import type { ContractCallOptions as StacksContractCallOptions } from '@stacks/connect';

export interface FinishedTxData {
    txId: string;
    txRaw: string;
    stacksTransaction: any;
}

export type ContractCallOptions = StacksContractCallOptions; 
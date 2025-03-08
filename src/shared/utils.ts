export const isBrowser = typeof window !== 'undefined';

export const WELSH = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v1';
export const PREDICTIONS = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.predictions-v1';

export const subnetTokens: Record<`${string}.${string}`, `${string}.${string}::${string}`> = {
    [WELSH]: 'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token::welshcorgicoin'
}; 

import { TransactionType } from '../types';

// Map transaction types to their target contracts and batch functions
export const txTypeContracts: Record<TransactionType, {
    contract: string,
    batchFunction: string
}> = {
    [TransactionType.TRANSFER]: {
        contract: WELSH,
        batchFunction: 'batch-transfer'
    },
    [TransactionType.PREDICT]: {
        contract: PREDICTIONS,
        batchFunction: 'batch-predict'
    },
    [TransactionType.CLAIM_REWARD]: {
        contract: PREDICTIONS,
        batchFunction: 'batch-claim-reward'
    }
};
import { Cl } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { TransferMessage, PredictionMessage, ClaimRewardMessage } from '../types';
import { PREDICTIONS } from './utils';

export function createWelshDomain() {
    return Cl.tuple({
        name: Cl.stringAscii("blaze"),
        version: Cl.stringAscii("0.1.1"),
        "chain-id": Cl.uint(STACKS_MAINNET.chainId),
    });
}

export function createWelshPredictionDomain() {
    return Cl.tuple({
        name: Cl.stringAscii("blaze"),
        version: Cl.stringAscii("welsh-predict-v1"),
        "chain-id": Cl.uint(STACKS_MAINNET.chainId),
    });
}

export function createTransferhMessage(message: TransferMessage) {
    return Cl.tuple({
        to: Cl.principal(message.to),
        amount: Cl.uint(message.amount),
        nonce: Cl.uint(message.nonce)
    });
}

export function createPredictionMessage(message: PredictionMessage) {
    // For predictions, we use the same message format as transfers
    // but the target address is the prediction contract
    return Cl.tuple({
        to: Cl.principal(PREDICTIONS),
        amount: Cl.uint(message.amount),
        nonce: Cl.uint(message.nonce)
    });
}

export function createClaimRewardMessage(message: ClaimRewardMessage) {
    return Cl.tuple({
        receipt_id: Cl.uint(message.receiptId),
        nonce: Cl.uint(message.nonce)
    });
}
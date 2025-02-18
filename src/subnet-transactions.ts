import { Cl, makeContractCall, broadcastTransaction, TxBroadcastResult } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { Transfer } from './subnet';

export interface BatchTransferOptions {
    contract: string;
    operations: Transfer[];
    privateKey: string;
}

export interface SingleTransferOptions {
    contract: string;
    operation: Transfer;
    privateKey: string;
}

export interface TransferResult {
    txid: string;
    status: 'success' | 'failed';
}

export function validateTransferOperation(operation: Transfer): void {
    if (!operation.to || !operation.signer || !operation.signature) {
        throw new Error('Invalid transfer operation: missing required fields');
    }

    if (operation.amount <= 0) {
        throw new Error('Invalid transfer operation: amount must be positive');
    }

    if (operation.nonce <= 0) {
        throw new Error('Invalid transfer operation: nonce must be positive');
    }
}

export function buildSingleTransferTxOptions(params: SingleTransferOptions) {
    const { contract, operation, privateKey } = params;

    if (!contract || !privateKey) {
        throw new Error('Invalid parameters for building transfer transaction');
    }

    // Validate operation
    validateTransferOperation(operation);

    const [contractAddress, contractName] = contract.split('.');
    if (!contractAddress || !contractName) {
        throw new Error('Invalid contract format');
    }

    return {
        contractAddress,
        contractName,
        functionName: 'transfer',
        functionArgs: [
            Cl.bufferFromHex(operation.signature),
            Cl.principal(operation.signer),
            Cl.principal(operation.to),
            Cl.uint(operation.amount),
            Cl.uint(operation.nonce)
        ],
        senderKey: privateKey,
        network: STACKS_MAINNET,
        fee: 1800
    };
}

export function buildBatchTransferTxOptions(params: BatchTransferOptions) {
    const { contract, operations, privateKey } = params;

    if (!contract || !operations.length || !privateKey) {
        throw new Error('Invalid parameters for building batch transfer transaction');
    }

    // Validate each operation
    operations.forEach(validateTransferOperation);

    const [contractAddress, contractName] = contract.split('.');
    if (!contractAddress || !contractName) {
        throw new Error('Invalid contract format');
    }

    const clarityOperations = operations.map(op => {
        return Cl.tuple({
            signature: Cl.bufferFromHex(op.signature),
            signer: Cl.principal(op.signer),
            to: Cl.principal(op.to),
            amount: Cl.uint(op.amount),
            nonce: Cl.uint(op.nonce),
        });
    });

    return {
        contractAddress,
        contractName,
        functionName: 'batch-transfer',
        functionArgs: [Cl.list(clarityOperations)],
        senderKey: privateKey,
        network: STACKS_MAINNET,
        fee: 1800
    };
}

export async function executeTransfer(params: SingleTransferOptions): Promise<TransferResult> {
    const txOptions = buildSingleTransferTxOptions(params);

    const transaction = await makeContractCall(txOptions as any);
    console.log('Transaction:', transaction);

    const response: TxBroadcastResult = await broadcastTransaction({
        transaction,
        network: STACKS_MAINNET,
    });

    if ('error' in response) throw new Error(response.error);

    console.log('Transfer broadcasted:', response);
    return {
        txid: response.txid,
        status: response.txid ? 'success' : 'failed'
    };
}

export async function executeBatchTransfer(params: BatchTransferOptions): Promise<TransferResult> {
    const txOptions = buildBatchTransferTxOptions(params);

    const transaction = await makeContractCall(txOptions as any);
    console.log('Transaction:', transaction);

    const response: TxBroadcastResult = await broadcastTransaction({
        transaction,
        network: STACKS_MAINNET,
    });

    if ('error' in response) throw new Error(response.error);

    console.log('Batch transfer broadcasted:', response);
    return {
        txid: response.txid,
        status: response.txid ? 'success' : 'failed'
    };
} 
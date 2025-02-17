import { makeContractCall, broadcastTransaction, Cl, TxBroadcastResult, fetchCallReadOnlyFunction, ClarityType } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';

/**
 * Core types
 */
export interface Transfer {
    to: string;
    amount: number;
    nonce: number;
    signature: string;
}

export interface Balance {
    confirmed: number;
    unconfirmed: number;
    total: number;
}

export interface NodeStatus {
    isProcessing: boolean;
    registeredTokens: string[];
    queueSizes: { [token: string]: number };
    lastProcessedBlock?: number;
}

// Global state for tracking transfers and node status
const state = {
    // Unconfirmed balance changes (negative values for outgoing transfers)
    unconfirmedBalances: new Map<string, number>(),
    // Next nonce to use per user
    nextNonce: new Map<string, number>(),
    // Transfer queues
    queues: new Map<string, Transfer[]>(),
    // Registered tokens
    tokens: new Set<string>(),
    // Node processing status
    isProcessing: false,
    // Last processed block
    lastProcessedBlock: 0
};

/**
 * State key helper
 */
function getStateKey(contract: string, user: string): string {
    return `${contract}:${user}`;
}

/**
 * Token Management
 */
export function registerToken(tokenContract: string): void {
    state.tokens.add(tokenContract);
    if (!state.queues.has(tokenContract)) {
        state.queues.set(tokenContract, []);
    }
}

/**
 * Contract Read Methods
 */
async function getContractBalance(contract: string, user: string): Promise<number> {
    const [contractAddress, contractName] = contract.split('.');
    try {
        const result = await fetchCallReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: 'get-balance',
            functionArgs: [Cl.principal(user)],
            network: STACKS_MAINNET,
            senderAddress: user
        });

        if (result.type === ClarityType.UInt) {
            return Number(result);
        }
        return 0;
    } catch (error) {
        console.error('Failed to fetch contract balance:', error);
        return 0;
    }
}

async function getContractNonce(contract: string, user: string): Promise<number> {
    const [contractAddress, contractName] = contract.split('.');
    try {
        const result = await fetchCallReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: 'get-nonce',
            functionArgs: [Cl.principal(user)],
            network: STACKS_MAINNET,
            senderAddress: user
        });

        if (result.type === ClarityType.UInt) {
            return Number(result);
        }
        return 0;
    } catch (error) {
        console.error('Failed to fetch contract nonce:', error);
        return 0;
    }
}

/**
 * Balance Management
 */
export async function getBalance(contract: string, user: string): Promise<Balance> {
    const key = getStateKey(contract, user);
    const onChainBalance = await getContractBalance(contract, user);
    const unconfirmedBalance = state.unconfirmedBalances.get(key) || 0;

    return {
        confirmed: onChainBalance,
        unconfirmed: unconfirmedBalance,
        total: onChainBalance + unconfirmedBalance
    };
}

export async function updateBalance(contract: string, user: string, amount: number): Promise<void> {
    const key = getStateKey(contract, user);
    const currentBalance = state.unconfirmedBalances.get(key) || 0;
    state.unconfirmedBalances.set(key, currentBalance + amount);
}

/**
 * Nonce Management
 */
export async function getNextNonce(contract: string, user: string): Promise<number> {
    const key = getStateKey(contract, user);

    // If we haven't tracked this user yet, get their current nonce from contract
    if (!state.nextNonce.has(key)) {
        const currentNonce = await getContractNonce(contract, user);
        state.nextNonce.set(key, currentNonce + 1);
        return currentNonce + 1;
    }

    // Otherwise use our tracked next nonce
    const nextNonce = state.nextNonce.get(key)!;
    state.nextNonce.set(key, nextNonce + 1);
    return nextNonce;
}

/**
 * Transfer Processing
 */
export async function addTransferToQueue(token: string, transfer: Transfer): Promise<void> {
    if (!state.tokens.has(token)) {
        throw new Error(`Token ${token} not registered`);
    }

    // Track unconfirmed balance changes
    const fromKey = getStateKey(token, transfer.to);
    const toKey = getStateKey(token, transfer.to);

    // Update unconfirmed balances
    state.unconfirmedBalances.set(fromKey, (state.unconfirmedBalances.get(fromKey) || 0) - transfer.amount);
    state.unconfirmedBalances.set(toKey, (state.unconfirmedBalances.get(toKey) || 0) + transfer.amount);

    // Add to queue
    const queue = state.queues.get(token) || [];
    queue.push(transfer);
    state.queues.set(token, queue);
}

/**
 * Queue Management
 */
export async function getQueueLength(token: string): Promise<number> {
    return state.queues.get(token)?.length || 0;
}

export async function getTransfersFromQueue(token: string): Promise<Transfer[]> {
    if (!state.tokens.has(token)) {
        throw new Error(`Token ${token} not registered`);
    }
    const queue = state.queues.get(token) || [];
    return queue.slice(0, 200); // Max batch size hardcoded to 200
}

export async function removeProcessedTransfers(token: string, count: number): Promise<void> {
    const queue = state.queues.get(token) || [];
    state.queues.set(token, queue.slice(count));
}

/**
 * Contract Interactions
 */
export async function verifySignature(
    contract: string,
    signature: string,
    signer: string,
    to: string,
    amount: number,
    nonce: number,
): Promise<boolean> {
    const [contractAddress, contractName] = contract.split('.');
    try {
        const result = await fetchCallReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: 'verify-signature',
            functionArgs: [
                Cl.bufferFromHex(signature),
                Cl.principal(signer),
                Cl.principal(to),
                Cl.uint(amount),
                Cl.uint(nonce)
            ],
            network: STACKS_MAINNET,
            senderAddress: signer
        });

        return result.type === ClarityType.BoolTrue;
    } catch (error) {
        console.error('Signature verification failed:', error);
        return false;
    }
}

export async function executeBatchTransfer(
    contract: string,
    operations: Transfer[]
): Promise<{ txid: string; status: string }> {
    if (!process.env.PRIVATE_KEY) {
        throw new Error('PRIVATE_KEY environment variable not set');
    }

    const [contractAddress, contractName] = contract.split('.');
    const clarityOperations = operations.map(op => {
        return Cl.tuple({
            to: Cl.principal(op.to),
            amount: Cl.uint(op.amount),
            nonce: Cl.uint(op.nonce),
            signature: Cl.bufferFromHex(op.signature.replace('0x', ''))
        });
    });

    const txOptions = {
        contractAddress,
        contractName,
        functionName: 'batch-transfer',
        functionArgs: [Cl.list(clarityOperations)],
        senderKey: process.env.PRIVATE_KEY,
        network: 'mainnet',
        fee: 1800
    };

    const transaction = await makeContractCall(txOptions as any);
    const response: TxBroadcastResult = await broadcastTransaction({
        transaction,
        network: 'mainnet',
    });

    if ('error' in response) {
        throw new Error(response.error);
    }

    return {
        txid: response.txid,
        status: response.txid ? 'success' : 'failed'
    };
}

/**
 * Node Status Management
 */
export function getNodeStatus(): NodeStatus {
    const queueSizes: { [token: string]: number } = {};

    for (const token of state.tokens) {
        queueSizes[token] = state.queues.get(token)?.length || 0;
    }

    return {
        isProcessing: state.isProcessing,
        registeredTokens: Array.from(state.tokens),
        queueSizes,
        lastProcessedBlock: state.lastProcessedBlock
    };
}

/**
 * Enhanced Token Management
 */
export function deregisterToken(token: string): void {
    if (!state.tokens.has(token)) {
        throw new Error(`Token ${token} not registered`);
    }

    if (state.isProcessing) {
        throw new Error('Cannot deregister token while node is processing transfers');
    }

    // Clear all state for this token
    state.tokens.delete(token);
    state.queues.delete(token);

    // Clear unconfirmed balances for this token
    for (const [key, _] of state.unconfirmedBalances) {
        if (key.startsWith(`${token}:`)) {
            state.unconfirmedBalances.delete(key);
        }
    }
}

export function getRegisteredTokens(): string[] {
    return Array.from(state.tokens);
}

export async function processTransfers(token: string): Promise<void> {
    if (!state.tokens.has(token)) {
        throw new Error(`Token ${token} not registered`);
    }

    const queueLength = await getQueueLength(token);
    if (queueLength === 0) return;

    state.isProcessing = true;

    try {
        const transfers = await getTransfersFromQueue(token);
        if (transfers.length === 0) return;

        const result = await executeBatchTransfer(token, transfers);
        if (result.status === 'success') {
            // Clear unconfirmed balances for processed transfers
            for (const transfer of transfers) {
                const fromKey = getStateKey(token, transfer.to);
                const toKey = getStateKey(token, transfer.to);
                state.unconfirmedBalances.delete(fromKey);
                state.unconfirmedBalances.delete(toKey);
            }

            await removeProcessedTransfers(token, transfers.length);
        }
    } catch (err: any) {
        // Just log the error and rethrow
        console.error('Failed to process transfers:', err);
        throw err;
    } finally {
        state.isProcessing = false;
    }
}

/**
 * Process all registered tokens
 */
export async function processAllTokens(): Promise<void> {
    const promises = Array.from(state.tokens).map(token =>
        processTransfers(token).catch(error => {
            console.error(`Failed to process token ${token}:`, error);
        })
    );

    await Promise.all(promises);
} 
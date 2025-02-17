import { makeContractCall, broadcastTransaction, Cl, TxBroadcastResult, fetchCallReadOnlyFunction, ClarityType } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';

/**
 * Core types
 */
export interface Transfer {
    signer: string;
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
    contracts: string[];
    queueSizes: { [contract: string]: number };
    lastProcessedBlock?: number;
}

export class Subnet {
    contract: string;
    unconfirmedBalances: Map<string, number>;
    nextNonce: Map<string, number>;
    queue: Transfer[];
    isProcessing: boolean;
    lastProcessedBlock: number;

    constructor(contract: string) {
        if (!contract) {
            throw new Error('Contract address is required');
        }
        this.contract = contract;
        this.unconfirmedBalances = new Map();
        this.nextNonce = new Map();
        this.queue = [];
        this.isProcessing = false;
        this.lastProcessedBlock = 0;
    }

    private getStateKey(user: string): string {
        return `${this.contract}:${user}`;
    }

    // Contract Read Methods
    private async getContractBalance(user: string): Promise<number> {
        const [contractAddress, contractName] = this.contract.split('.');
        try {
            const result = await fetchCallReadOnlyFunction({
                contractAddress,
                contractName,
                functionName: 'get-balance',
                functionArgs: [Cl.principal(user)],
                network: STACKS_MAINNET,
                senderAddress: user
            });

            return result.type === ClarityType.UInt ? Number(result) : 0;
        } catch (error) {
            console.error('Failed to fetch contract balance:', error);
            return 0;
        }
    }

    async getContractNonce(user: string): Promise<number> {
        const [contractAddress, contractName] = this.contract.split('.');
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

    public async getBalance(user: string): Promise<Balance> {
        const key = this.getStateKey(user);
        const onChainBalance = await this.getContractBalance(user);
        const unconfirmedBalance = this.unconfirmedBalances.get(key) || 0;

        return {
            confirmed: onChainBalance,
            unconfirmed: unconfirmedBalance,
            total: onChainBalance + unconfirmedBalance
        };
    }

    public async updateBalance(user: string, amount: number): Promise<void> {
        const key = this.getStateKey(user);
        const currentBalance = this.unconfirmedBalances.get(key) || 0;
        this.unconfirmedBalances.set(key, currentBalance + amount);
    }

    public async getNextNonce(user: string): Promise<number> {
        const key = this.getStateKey(user);

        if (!this.nextNonce.has(key)) {
            const currentNonce = await this.getContractNonce(user);
            this.nextNonce.set(key, currentNonce + 1);
        }
        return this.nextNonce.get(key)!
    }

    public incrementNonce(user: string): void {
        const key = this.getStateKey(user);
        const currentNonce = this.nextNonce.get(key) || 0;
        this.nextNonce.set(key, currentNonce + 1);
    }

    public async addTransferToQueue(transfer: Transfer): Promise<void> {
        // Update unconfirmed balances
        const fromKey = this.getStateKey(transfer.signer);
        const toKey = this.getStateKey(transfer.to);
        this.unconfirmedBalances.set(fromKey, (this.unconfirmedBalances.get(fromKey) || 0) - transfer.amount);
        this.unconfirmedBalances.set(toKey, (this.unconfirmedBalances.get(toKey) || 0) + transfer.amount);

        // Add to queue
        this.queue.push(transfer);

        // Increment nonce
        await this.incrementNonce(transfer.signer);
    }

    public getNodeStatus(): NodeStatus {
        return {
            isProcessing: this.isProcessing,
            contracts: [this.contract],
            queueSizes: { [this.contract]: this.queue.length },
            lastProcessedBlock: this.lastProcessedBlock
        };
    }

    async verifySignature(transfer: Transfer): Promise<boolean> {
        const [contractAddress, contractName] = this.contract.split('.');
        try {
            const result = await fetchCallReadOnlyFunction({
                contractAddress,
                contractName,
                functionName: 'verify-signature',
                functionArgs: [
                    Cl.bufferFromHex(transfer.signature),
                    Cl.principal(transfer.signer),
                    Cl.principal(transfer.to),
                    Cl.uint(transfer.amount),
                    Cl.uint(transfer.nonce)
                ],
                network: STACKS_MAINNET,
                senderAddress: transfer.signer
            });

            return result.type === ClarityType.BoolTrue;
        } catch (error) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }

    async executeBatchTransfer(operations: Transfer[]): Promise<{ txid: string; status: string }> {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }

        const clarityOperations = operations.map(op => {
            return Cl.tuple({
                to: Cl.principal(op.to),
                amount: Cl.uint(op.amount),
                nonce: Cl.uint(op.nonce),
                signature: Cl.bufferFromHex(op.signature.replace('0x', ''))
            });
        });

        const txOptions = {
            contractAddress: this.contract.split('.')[0],
            contractName: this.contract.split('.')[1],
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

    async processTransfers(): Promise<void> {
        const queueLength = this.queue.length;
        if (queueLength === 0) return;

        this.isProcessing = true;

        try {
            const result = await this.executeBatchTransfer(this.queue);
            if (result.status === 'success') {
                // Clear unconfirmed balances for processed transfers
                this.queue.forEach(transfer => {
                    const fromKey = this.getStateKey(transfer.signer);
                    const toKey = this.getStateKey(transfer.to);
                    this.unconfirmedBalances.delete(fromKey);
                    this.unconfirmedBalances.delete(toKey);
                });

                this.queue.splice(0, queueLength);
            }
        } catch (err: any) {
            // Just log the error and rethrow
            console.error('Failed to process transfers:', err);
            throw err;
        } finally {
            this.isProcessing = false;
        }
    }
}
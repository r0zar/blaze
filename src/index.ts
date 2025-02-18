import { makeContractCall, broadcastTransaction, Cl, TxBroadcastResult, fetchCallReadOnlyFunction, ClarityType } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { getFullBalance, updateUnconfirmedBalance } from './balance';

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

export interface Status {
    isProcessing: boolean;
    contracts: string[];
    queueSizes: { [contract: string]: number };
    lastProcessedBlock?: number;
}

export class Subnet {
    contract: string;
    queue: Transfer[];
    isProcessing: boolean;
    lastProcessedBlock: number;

    constructor(contract: string) {
        if (!contract) {
            throw new Error('Contract address is required');
        }
        this.contract = contract;
        this.queue = [];
        this.isProcessing = false;
        this.lastProcessedBlock = 0;
    }

    public async getBalance(user: string): Promise<Balance> {
        return await getFullBalance(this.contract, user);
    }

    public async addTransferToQueue(transfer: Transfer): Promise<void> {
        // Update unconfirmed balances
        await Promise.all([
            updateUnconfirmedBalance(
                this.contract,
                transfer.signer,
                -transfer.amount
            ),
            updateUnconfirmedBalance(
                this.contract,
                transfer.to,
                transfer.amount
            )
        ]);

        // Add to queue
        this.queue.push(transfer);
    }

    public getStatus(): Status {
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
                // Clear the queue - balances will be updated by chainhooks
                this.queue.splice(0, queueLength);
            }
        } catch (err: any) {
            console.error('Failed to process transfers:', err);
            throw err;
        } finally {
            this.isProcessing = false;
        }
    }
}

// Re-export balance utilities
export * from './balance';
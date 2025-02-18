import { fetchCallReadOnlyFunction, Cl, ClarityType, signStructuredData } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { getFullBalance, updateUnconfirmedBalance } from './balance';
import { createBlazeDomain, createBlazeMessage } from './structured-data';
import { executeBatchTransfer, BatchTransferResult } from './subnet-transactions';
import 'dotenv/config';

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
    contracts: string[];
    queueSizes: { [contract: string]: number };
    lastProcessedBlock?: number;
}

export class Subnet {
    contract: string;
    queue: Transfer[];
    lastProcessedBlock: number;

    constructor(contract: string) {
        if (!contract) {
            throw new Error('Contract address is required');
        }
        this.contract = contract;
        this.queue = [];
        this.lastProcessedBlock = 0;
    }

    public getStatus(): Status {
        return {
            contracts: [this.contract],
            queueSizes: { [this.contract]: this.queue.length },
            lastProcessedBlock: this.lastProcessedBlock
        };
    }

    public async getBalance(user: string): Promise<Balance> {
        return await getFullBalance(this.contract, user);
    }

    public async addTransferToQueue(transfer: Transfer): Promise<void> {
        // verify the balances
        const balances = await this.getBalance(transfer.signer);
        if (balances.confirmed < transfer.amount) {
            throw new Error('Insufficient balance');
        }

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
        console.log('Added transfer to queue:', transfer);
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

    async processTransfers(): Promise<BatchTransferResult | void> {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }

        const queueLength = this.queue.length;
        if (queueLength === 0) return;

        console.log('Processing transfers:', queueLength);

        const result = await executeBatchTransfer({
            contract: this.contract,
            operations: this.queue,
            privateKey: process.env.PRIVATE_KEY
        });

        if (result.status === 'success') {
            this.queue.splice(0, queueLength);
        }

        return result;
    }

    signTransfer(token: string, to: string, amount: number, nonce: number) {
        const domain = createBlazeDomain();
        const message = createBlazeMessage({ token, to, amount, nonce });
        return signStructuredData({ message, domain, privateKey: process.env.PRIVATE_KEY! });
    }
} 
import { makeContractCall, broadcastTransaction, TxBroadcastResult, signStructuredData, fetchCallReadOnlyFunction, Cl, ClarityType } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { BlazeMessage, createBlazeDomain, createBlazeMessage } from '../shared/structured-data';
import { SUBNETS } from '../shared/constants';
import { buildDepositTxOptions, buildWithdrawTxOptions } from '../shared/transactions';
import type { Balance, TransferOptions, TransactionResult, Transfer, Status, BlazeEvent, BalanceOptions } from '../shared/types';
import { kv } from '@vercel/kv';
import { config } from './config';

export class Subnet {
    private subnet: string;
    private tokenIdentifier: string;
    private signer: string;
    public nodeUrl: string;
    private queue: Transfer[];
    private lastProcessedBlock: number;
    private eventClients: Map<string, Set<(event: BlazeEvent) => void>> = new Map();
    private config = config;

    constructor(subnet: string, signer: string, nodeUrl: string = 'https://charisma.rocks/api/v0/blaze') {
        this.signer = signer;
        this.nodeUrl = nodeUrl;
        this.queue = [];
        this.lastProcessedBlock = 0;

        if (!subnet) {
            throw new Error('Subnet contract address is required');
        }
        this.subnet = subnet;

        this.tokenIdentifier = SUBNETS[subnet as keyof typeof SUBNETS];
        if (!this.tokenIdentifier) {
            throw new Error(`No token identifier found for subnet: ${subnet}`);
        }
    }

    public addEventClient(signer: string, callback: (event: BlazeEvent) => void) {
        if (!this.eventClients.has(signer)) {
            this.eventClients.set(signer, new Set());
        }
        this.eventClients.get(signer)?.add(callback);
    }

    public removeEventClient(signer: string, callback: (event: BlazeEvent) => void) {
        this.eventClients.get(signer)?.delete(callback);
        if (this.eventClients.get(signer)?.size === 0) {
            this.eventClients.delete(signer);
        }
    }

    private emitEvent(event: BlazeEvent) {
        // Emit to specific signer if event is targeted
        if (event.data.from) {
            this.eventClients.get(event.data.from)?.forEach(callback => callback(event));
        }
        if (event.data.to) {
            this.eventClients.get(event.data.to)?.forEach(callback => callback(event));
        }

        // Emit to all clients interested in this contract's events
        this.eventClients.get(this.subnet)?.forEach(callback => callback(event));
    }

    public getStatus(): Status {
        return {
            contracts: [this.subnet],
            queueSizes: { [this.subnet]: this.queue.length },
            lastProcessedBlock: this.lastProcessedBlock
        };
    }

    private getBalanceKey(type: 'confirmed' | 'unconfirmed', user?: string): string {
        const address = user || this.signer;
        return `${this.subnet}:${address}:${type}`;
    }

    /**
     * Fetch a user's on-chain balance from the contract
     */
    private async fetchContractBalance(user: string): Promise<number> {
        const [contractAddress, contractName] = this.subnet.split('.');
        try {
            const result = await fetchCallReadOnlyFunction({
                contractAddress,
                contractName,
                functionName: 'get-balance',
                functionArgs: [Cl.principal(user)],
                network: STACKS_MAINNET,
                senderAddress: user
            });
            return result.type === ClarityType.UInt ? Number(result.value) : 0;
        } catch (error) {
            console.error('Failed to fetch contract balance:', error);
            return 0;
        }
    }

    /**
     * Get a user's confirmed balance from KV store, fetching from contract if not found
     */
    private async getConfirmedBalance(user: string): Promise<number> {
        const key = this.getBalanceKey('confirmed', user);
        const storedBalance = await kv.get<number>(key);

        if (storedBalance === null) {
            // First time: fetch from contract and store
            const contractBalance = await this.fetchContractBalance(user);
            await kv.set(key, contractBalance);
            return contractBalance;
        }

        return storedBalance;
    }

    /**
     * Get a user's unconfirmed balance changes from KV store
     */
    private async getUnconfirmedBalance(user: string): Promise<number> {
        const key = this.getBalanceKey('unconfirmed', user);
        return await kv.get<number>(key) ?? 0;
    }

    /**
     * Get a user's complete balance information and emit balance event
     */
    async getBalance(user?: string, options?: BalanceOptions): Promise<Balance> {
        const address = user || this.signer;
        const [confirmed, unconfirmed] = await Promise.all([
            this.getConfirmedBalance(address),
            this.getUnconfirmedBalance(address)
        ]);

        const confirmedAmount = confirmed ?? 0;
        const unconfirmedAmount = unconfirmed ?? 0;

        const balance: Balance = {
            total: confirmedAmount + unconfirmedAmount
        };

        if (options?.includeConfirmed) {
            balance.confirmed = confirmedAmount;
        }

        if (options?.includeUnconfirmed) {
            balance.unconfirmed = unconfirmedAmount;
        }

        this.emitEvent({
            type: 'balance',
            contract: this.subnet,
            data: {
                from: address,
                balance,
                timestamp: Date.now()
            }
        });

        return balance;
    }

    /**
     * Process a deposit event
     * Updates both confirmed and unconfirmed balances
     */
    async processDepositEvent(user: string, amount: number): Promise<void> {
        const confirmedKey = this.getBalanceKey('confirmed', user);
        const unconfirmedKey = this.getBalanceKey('unconfirmed', user);

        const [currentConfirmed, currentUnconfirmed] = await Promise.all([
            kv.get<number>(confirmedKey),
            kv.get<number>(unconfirmedKey)
        ]);

        await Promise.all([
            kv.set(confirmedKey, (currentConfirmed ?? 0) + amount),
            kv.set(unconfirmedKey, (currentUnconfirmed ?? 0) + amount)
        ]);

        this.emitEvent({
            type: 'deposit',
            contract: this.subnet,
            data: {
                from: user,
                amount,
                status: 'completed',
                timestamp: Date.now()
            }
        });

        // Emit updated balance
        await this.getBalance(user);
    }

    /**
     * Process a withdrawal event
     * Updates both confirmed and unconfirmed balances
     */
    async processWithdrawEvent(user: string, amount: number): Promise<void> {
        const confirmedKey = this.getBalanceKey('confirmed', user);
        const unconfirmedKey = this.getBalanceKey('unconfirmed', user);

        const [currentConfirmed, currentUnconfirmed] = await Promise.all([
            kv.get<number>(confirmedKey),
            kv.get<number>(unconfirmedKey)
        ]);

        await Promise.all([
            kv.set(confirmedKey, (currentConfirmed ?? 0) - amount),
            kv.set(unconfirmedKey, (currentUnconfirmed ?? 0) - amount)
        ]);

        this.emitEvent({
            type: 'withdraw',
            contract: this.subnet,
            data: {
                to: user,
                amount,
                status: 'completed',
                timestamp: Date.now()
            }
        });

        // Emit updated balance
        await this.getBalance(user);
    }

    /**
     * Process a transfer event
     * Updates both confirmed and unconfirmed balances for sender and receiver
     */
    async processTransferEvent(from: string, to: string, amount: number, txid?: string): Promise<void> {
        // Get all balance keys
        const fromConfirmedKey = this.getBalanceKey('confirmed', from);
        const fromUnconfirmedKey = this.getBalanceKey('unconfirmed', from);
        const toConfirmedKey = this.getBalanceKey('confirmed', to);
        const toUnconfirmedKey = this.getBalanceKey('unconfirmed', to);

        // Get current balances
        const [fromConfirmed, fromUnconfirmed, toConfirmed, toUnconfirmed] = await Promise.all([
            kv.get<number>(fromConfirmedKey),
            kv.get<number>(fromUnconfirmedKey),
            kv.get<number>(toConfirmedKey),
            kv.get<number>(toUnconfirmedKey)
        ]);

        // Update all balances atomically
        await Promise.all([
            kv.set(fromConfirmedKey, (fromConfirmed ?? 0) - amount),
            kv.set(fromUnconfirmedKey, (fromUnconfirmed ?? 0) - amount),
            kv.set(toConfirmedKey, (toConfirmed ?? 0) + amount),
            kv.set(toUnconfirmedKey, (toUnconfirmed ?? 0) + amount)
        ]);

        // Emit transfer event
        this.emitEvent({
            type: 'transfer',
            contract: this.subnet,
            data: {
                from,
                to,
                amount,
                status: 'completed',
                txid,
                timestamp: Date.now()
            }
        });

        // Emit updated balances for both parties
        await Promise.all([
            this.getBalance(from),
            this.getBalance(to)
        ]);
    }

    /**
     * Update confirmed balance and emit event
     */
    async updateConfirmedBalance(userOrAmount: string | number, amount?: number): Promise<void> {
        if (typeof userOrAmount === 'number') {
            // Legacy support for old method signature
            await kv.set(this.getBalanceKey('confirmed'), userOrAmount);
            await this.getBalance();
        } else {
            await kv.set(this.getBalanceKey('confirmed', userOrAmount), amount!);
            await this.getBalance(userOrAmount);
        }
    }

    /**
     * Update unconfirmed balance and emit event
     */
    async updateUnconfirmedBalance(userOrAmount: string | number, amount?: number): Promise<void> {
        if (typeof userOrAmount === 'number') {
            // Legacy support for old method signature
            await kv.set(this.getBalanceKey('unconfirmed'), userOrAmount);
            await this.getBalance();
        } else {
            await kv.set(this.getBalanceKey('unconfirmed', userOrAmount), amount!);
            await this.getBalance(userOrAmount);
        }
    }

    private async executeTransaction(txOptions: any): Promise<TransactionResult> {
        if (!this.config.privateKey) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }

        const transaction = await makeContractCall({
            ...txOptions,
            senderKey: this.config.privateKey,
            network: STACKS_MAINNET,
        });

        const response: TxBroadcastResult = await broadcastTransaction({
            transaction,
            network: STACKS_MAINNET,
        });

        if ('error' in response) throw new Error(response.error);
        return { txid: response.txid };
    }

    async transfer(options: TransferOptions) {
        const nextNonce = Date.now();
        const tokens = options.amount;

        if (!this.config.privateKey) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }

        const signature = await this.generateSignature({
            to: options.to,
            amount: tokens,
            nonce: nextNonce
        });

        const transfer: Transfer = {
            signature,
            signer: this.signer,
            to: options.to,
            amount: tokens,
            nonce: nextNonce,
        };

        this.emitEvent({
            type: 'transfer',
            contract: this.subnet,
            data: {
                from: this.signer,
                to: options.to,
                amount: tokens,
                status: 'pending',
                timestamp: Date.now()
            }
        });

        await this.addTransferToQueue(transfer);

        // Check if we should process the batch
        if (this.shouldProcessBatch()) {
            return this.processTransfers();
        }

        return { queued: true, queueSize: this.queue.length };
    }

    private shouldProcessBatch(): boolean {
        // Add your batch processing logic here
        // For example, process when queue reaches certain size
        return this.queue.length >= 20;
    }

    /**
     * Apply an unconfirmed balance change immediately and emit event
     */
    private async applyUnconfirmedChange(user: string, amount: number, type: 'deposit' | 'withdraw' | 'transfer'): Promise<void> {
        const unconfirmedKey = this.getBalanceKey('unconfirmed', user);
        const currentUnconfirmed = await kv.get<number>(unconfirmedKey) ?? 0;

        // Update unconfirmed balance immediately
        await kv.set(unconfirmedKey, currentUnconfirmed + amount);

        // Emit balance update event immediately
        await this.getBalance(user);

        // Emit specific event type
        this.emitEvent({
            type,
            contract: this.subnet,
            data: {
                from: type === 'withdraw' ? undefined : user,
                to: type === 'withdraw' ? user : (type === 'transfer' ? undefined : undefined),
                amount: Math.abs(amount),
                status: 'processing',
                timestamp: Date.now()
            }
        });
    }

    /**
     * Convert unconfirmed balance to confirmed balance
     * This should be called when a transaction is confirmed on-chain
     */
    private async confirmBalanceChange(user: string, amount: number): Promise<void> {
        const confirmedKey = this.getBalanceKey('confirmed', user);
        const unconfirmedKey = this.getBalanceKey('unconfirmed', user);

        const [currentConfirmed, currentUnconfirmed] = await Promise.all([
            kv.get<number>(confirmedKey),
            kv.get<number>(unconfirmedKey)
        ]);

        // Move the amount from unconfirmed to confirmed
        await Promise.all([
            kv.set(confirmedKey, (currentConfirmed ?? 0) + amount),
            kv.set(unconfirmedKey, (currentUnconfirmed ?? 0) - amount)
        ]);

        // Emit updated balance
        await this.getBalance(user);
    }

    /**
     * Verify and reconcile balances with on-chain state
     */
    private async reconcileBalance(user: string): Promise<void> {
        const contractBalance = await this.fetchContractBalance(user);
        const confirmedKey = this.getBalanceKey('confirmed', user);

        // Update confirmed balance to match contract
        await kv.set(confirmedKey, contractBalance);

        // Emit updated balance
        await this.getBalance(user);
    }

    public async addTransferToQueue(transfer: Transfer): Promise<void> {
        // Validate transfer including signature verification
        await this.validateTransferOperation(transfer);

        // Verify balances
        const balances = await this.getBalance(transfer.signer);
        if ((balances.confirmed ?? 0) + (balances.unconfirmed ?? 0) < transfer.amount) {
            this.emitEvent({
                type: 'transfer',
                contract: this.subnet,
                data: {
                    from: transfer.signer,
                    to: transfer.to,
                    amount: transfer.amount,
                    status: 'failed',
                    error: 'Insufficient balance',
                    timestamp: Date.now()
                }
            });
            throw new Error('Insufficient balance');
        }

        // Apply unconfirmed changes immediately
        await Promise.all([
            this.applyUnconfirmedChange(transfer.signer, -transfer.amount, 'transfer'),
            this.applyUnconfirmedChange(transfer.to, transfer.amount, 'transfer')
        ]);

        // Add to queue
        this.queue.push(transfer);
        console.log('Added transfer to queue:', transfer);
    }

    public async processTransfers(): Promise<TransactionResult | void> {
        if (!this.config.privateKey) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }

        const queueLength = this.queue.length;
        if (queueLength === 0) return;

        console.log('Processing transfers:', queueLength);

        this.emitEvent({
            type: 'batch',
            contract: this.subnet,
            data: {
                status: 'processing',
                timestamp: Date.now()
            }
        });

        try {
            await Promise.all(this.queue.map(transfer => this.validateTransferOperation(transfer)));

            const txOptions = this.buildBatchTransferTxOptions(this.queue);
            const result = await this.executeTransaction(txOptions);

            // Emit events for each transfer in the batch
            this.queue.forEach(transfer => {
                this.emitEvent({
                    type: 'transfer',
                    contract: this.subnet,
                    data: {
                        from: transfer.signer,
                        to: transfer.to,
                        amount: transfer.amount,
                        status: 'completed',
                        txid: result.txid,
                        timestamp: Date.now()
                    }
                });
            });

            // Clear the processed transfers from the queue
            this.queue.splice(0, queueLength);

            this.emitEvent({
                type: 'batch',
                contract: this.subnet,
                data: {
                    status: 'completed',
                    txid: result.txid,
                    timestamp: Date.now()
                }
            });

            return result;
        } catch (error) {
            // On failure, reconcile all affected balances
            await Promise.all(
                [...new Set(this.queue.flatMap(t => [t.signer, t.to]))].map(
                    user => this.reconcileBalance(user)
                )
            );

            this.emitEvent({
                type: 'batch',
                contract: this.subnet,
                data: {
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: Date.now()
                }
            });
            throw error;
        }
    }

    async deposit(amount: number) {
        this.emitEvent({
            type: 'deposit',
            contract: this.subnet,
            data: {
                from: this.signer,
                amount,
                status: 'pending',
                timestamp: Date.now()
            }
        });

        try {
            // Apply unconfirmed change immediately
            await this.applyUnconfirmedChange(this.signer, amount, 'deposit');

            const txOptions = buildDepositTxOptions({
                subnet: this.subnet,
                amount
            });

            const result = await this.executeTransaction(txOptions);

            this.emitEvent({
                type: 'deposit',
                contract: this.subnet,
                data: {
                    from: this.signer,
                    amount,
                    status: 'completed',
                    txid: result.txid,
                    timestamp: Date.now()
                }
            });

            return result;
        } catch (error) {
            // On failure, reconcile balance with contract
            await this.reconcileBalance(this.signer);

            this.emitEvent({
                type: 'deposit',
                contract: this.subnet,
                data: {
                    from: this.signer,
                    amount,
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: Date.now()
                }
            });
            throw error;
        }
    }

    async withdraw(amount: number) {
        this.emitEvent({
            type: 'withdraw',
            contract: this.subnet,
            data: {
                to: this.signer,
                amount,
                status: 'pending',
                timestamp: Date.now()
            }
        });

        try {
            // Apply unconfirmed change immediately
            await this.applyUnconfirmedChange(this.signer, -amount, 'withdraw');

            const txOptions = buildWithdrawTxOptions({
                subnet: this.subnet,
                amount
            });

            const result = await this.executeTransaction(txOptions);

            this.emitEvent({
                type: 'withdraw',
                contract: this.subnet,
                data: {
                    to: this.signer,
                    amount,
                    status: 'completed',
                    txid: result.txid,
                    timestamp: Date.now()
                }
            });

            return result;
        } catch (error) {
            // On failure, reconcile balance with contract
            await this.reconcileBalance(this.signer);

            this.emitEvent({
                type: 'withdraw',
                contract: this.subnet,
                data: {
                    to: this.signer,
                    amount,
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: Date.now()
                }
            });
            throw error;
        }
    }

    async generateSignature(message: BlazeMessage): Promise<string> {
        const domain = createBlazeDomain();
        const clarityMessage = createBlazeMessage(message);

        const signature = await signStructuredData({
            message: clarityMessage,
            domain,
            privateKey: this.config.privateKey!
        });

        return signature;
    }

    async verifySignature(transfer: Transfer): Promise<boolean> {
        const [contractAddress, contractName] = this.subnet.split('.');
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

    async validateTransferOperation(operation: Transfer): Promise<void> {
        if (!operation.to || !operation.signer || !operation.signature) {
            throw new Error('Invalid transfer operation: missing required fields');
        }
        if (operation.amount <= 0) {
            throw new Error('Invalid transfer operation: amount must be positive');
        }
        if (operation.nonce <= 0) {
            throw new Error('Invalid transfer operation: nonce must be positive');
        }
        // Verify signature
        const isValid = await this.verifySignature(operation);
        if (!isValid) {
            throw new Error('Invalid transfer operation: signature verification failed');
        }
    }

    buildBatchTransferTxOptions(operations: Transfer[]) {
        if (!this.subnet || !operations.length) {
            throw new Error('Invalid parameters for building batch transfer transaction');
        }

        const [contractAddress, contractName] = this.subnet.split('.');
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
            senderKey: this.config.privateKey!,
            network: STACKS_MAINNET,
            fee: 1800
        };
    }
}